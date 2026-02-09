import mqtt from 'mqtt';
import config from '../config/env';
import sysLogger from '../utils/logger';
import { presenceService } from './PresenceService';
import { getIo } from '../socket';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { realtimeRegistry } from './realtimeRegistry';

export class MqttBridge {
    private client: mqtt.MqttClient | null = null;
    private supabase: SupabaseClient;

    constructor() {
        this.supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);
    }

    init() {
        if (this.client) {
            sysLogger.warn('[MqttBridge] Bridge already initialized.');
            return;
        }

        sysLogger.debug(`📡 [MqttBridge] Initializing bridge for ${config.mqtt.url}`);
        sysLogger.info(`[MqttBridge] Connecting to MQTT Broker: ${config.mqtt.url}`);

        const username = config.mqtt.username;
        const password = config.mqtt.password;

        this.client = mqtt.connect(config.mqtt.url, {
            username: username,
            password: password,
            clientId: `backend_${Math.random().toString(16).slice(2, 10)}`,
            clean: true,
            connectTimeout: 30000,
            keepalive: 60,
            reconnectPeriod: 5000,
            protocolVersion: 4,
            // HiveMQ Cloud requires TLS (mqtts)
            rejectUnauthorized: false,
        } as any);

        sysLogger.info({
            url: config.mqtt.url,
            clientId: (this.client as any).options?.clientId || 'unknown',
            username: username
        }, '[MqttBridge] Attempting MQTT connection...');

        this.client.on('connect', () => {
            sysLogger.info('[MqttBridge] Connected to MQTT Broker 🚀');
            // Try broad subscription for debugging
            this.client?.subscribe('devices/#', (err) => {
                if (err) sysLogger.error(err, '[MqttBridge] Subscribe Error');
                else sysLogger.info('[MqttBridge] Subscribed to devices/#');
            });
        });

        this.client.on('message', (topic, message) => {
            sysLogger.debug(`[MqttBridge] 📥 Received: ${topic}`);
            this.handleMessage(topic, message.toString());
        });

        this.client.on('error', (err) => {
            sysLogger.error(err, '[MqttBridge] MQTT Error');
        });

        this.client.on('reconnect', () => {
            sysLogger.warn('[MqttBridge] MQTT Reconnecting...');
        });

        this.client.on('offline', () => {
            sysLogger.warn('[MqttBridge] MQTT Client Offline');
        });

        this.client.on('close', () => {
            sysLogger.info('[MqttBridge] MQTT Connection Closed');
        });
    }

    /**
     * Check if the MQTT bridge is currently active (client exists).
     */
    isActive(): boolean {
        return !!this.client;
    }

    private async handleMessage(topic: string, payload: string) {
        const systemConfig = realtimeRegistry.getSystemConfig();

        // 🛡️ Global System Control
        if (!systemConfig.mqttEnabled) {
            sysLogger.warn(`[MqttBridge] 🛑 MQTT is disabled in config. Ignoring message on ${topic}`);
            return;
        }

        sysLogger.debug(`[MqttBridge] 📥 Processing: ${topic} | Payload: ${payload}`);

        const parts = topic.split('/');
        // parts = ['devices', 'DEVICE_ID', 'status' | 'sms']
        if (parts.length < 3) return;

        const deviceId = parts[1];
        const type = parts[2];

        if (type === 'status') {
            sysLogger.info(`[MqttBridge] 📱 Device status update: ${deviceId} -> ${payload}`);
            await this.handleStatusChange(deviceId, payload);
        } else if (type === 'sms' && parts[3] === 'new') {
            await this.handleNewSms(deviceId, payload);
        } else if (type === 'telemetry') {
            await this.handleTelemetry(deviceId, payload);
        }
    }

    private async handleStatusChange(deviceId: string, status: string) {
        const isOnline = status === 'online';
        const icon = isOnline ? '🟢' : '🔴';
        sysLogger.debug(`[MqttBridge] ${icon} Device ${status.toUpperCase()}: ${deviceId}`);

        // 1. Update Redis Presence (Instant source of truth)
        if (isOnline) {
            await presenceService.markOnline(deviceId);
        } else {
            await presenceService.markOffline(deviceId);
        }

        // 2. Persist to DB and get appId
        let appId: string | null = null;
        try {
            // We update and select back to get the app_id
            const { data: result } = await this.supabase
                .from('devices')
                .update({
                    status: isOnline,
                    last_seen: new Date().toISOString()
                })
                .eq('device_id', deviceId)
                .select('app_id')
                .maybeSingle();

            appId = result?.app_id;
        } catch (err) {
            sysLogger.error(`[MqttBridge] DB Status update failed for ${deviceId}`);
        }

        // 3. Notify via Registry (Batched)
        try {
            realtimeRegistry.relayDeviceUpdate({
                device_id: deviceId,
                status: isOnline,
                last_seen: new Date().toISOString(),
                app_id: appId
            });

            if (appId) {
                getIo().to(`app-${appId}`).emit('device_change', {
                    eventType: 'UPDATE',
                    new: { device_id: deviceId, status: isOnline, last_seen: new Date().toISOString(), app_id: appId }
                });
            }
        } catch (err) { }
    }

    private async handleNewSms(deviceId: string, payload: string) {
        sysLogger.debug(`[MqttBridge] New SMS via MQTT for device: ${deviceId}`);

        try {
            const smsData = JSON.parse(payload);
            realtimeRegistry.relayMessage({ ...smsData, device_id: deviceId, _source: 'mqtt' });
        } catch (err) {
            sysLogger.error(err, `[MqttBridge] Failed to parse/relay SMS for ${deviceId}`);
        }
    }

    private async handleTelemetry(deviceId: string, payload: string) {
        try {
            const data = JSON.parse(payload);
            sysLogger.debug(`[MqttBridge] 💓 Heartbeat (Telemetry) from: ${deviceId}`);

            await presenceService.markOnline(deviceId);

            const systemConfig = realtimeRegistry.getSystemConfig();
            const isHighScale = systemConfig?.highScaleMode;

            let appId: string | null = null;

            // ⚡ THROTTLED DB UPDATE: Skip SQL if in high-scale mode to save IOPS
            if (!isHighScale) {
                const { data: device } = await this.supabase
                    .from('devices')
                    .update({
                        heartbeat: data,
                        last_seen: new Date().toISOString()
                    })
                    .eq('device_id', deviceId)
                    .select('app_id')
                    .maybeSingle();

                appId = device?.app_id;
            }

            // RELAY VIA REGISTRY (Batched for Admin, Immediate for Device)
            realtimeRegistry.relayDeviceUpdate({
                ...data,
                device_id: deviceId,
                last_seen: new Date().toISOString(),
                app_id: appId
            });

            // Extra emit for app-specific room which isn't in registry yet
            if (appId) {
                getIo().to(`app-${appId}`).emit('device_change', {
                    eventType: 'UPDATE',
                    new: { ...data, device_id: deviceId, last_seen: new Date().toISOString(), app_id: appId }
                });
            }
        } catch (err) {
            sysLogger.error(err, `[MqttBridge] Failed to process telemetry for ${deviceId}`);
        }
    }

    shutdown() {
        if (this.client) {
            const clientId = (this.client as any).options?.clientId;
            this.client.end(true);
            this.client = null;
            sysLogger.info({ clientId }, '[MqttBridge] Bridge shut down.');
        }
    }
}

export const mqttBridge = new MqttBridge();
