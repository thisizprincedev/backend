import mqtt from 'mqtt';
import config from '../config/env';
import sysLogger from '../utils/logger';
import { presenceService } from './PresenceService';
import { getIo } from '../socket';

export class MqttBridge {
    private client: mqtt.MqttClient | null = null;

    init() {
        if (this.client) {
            sysLogger.warn('[MqttBridge] Bridge already initialized.');
            return;
        }

        sysLogger.debug(`📡 [MqttBridge] Initializing bridge for ${config.mqtt.url}`);
        sysLogger.info(`[MqttBridge] Connecting to MQTT Broker: ${config.mqtt.url}`);

        const username = config.mqtt.username || config.nats.user;

        this.client = mqtt.connect(config.mqtt.url, {
            username: username,
            password: config.mqtt.password || config.nats.pass,
            clientId: `b_${Math.random().toString(16).slice(2, 8)}`, // Very short ID
            clean: true,
            connectTimeout: 60000,
            keepalive: 60,
            reconnectPeriod: 5000,
            protocolVersion: 4,
        });

        sysLogger.info({
            url: config.mqtt.url,
            clientId: this.client.options.clientId,
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

    private async handleMessage(topic: string, payload: string) {
        // 🛡️ Global System Control
        const { realtimeRegistry } = require('./realtimeRegistry');
        if (!realtimeRegistry.getSystemConfig().mqttEnabled) {
            return;
        }

        const parts = topic.split('/');
        // parts = ['devices', 'DEVICE_ID', 'status' | 'sms']
        if (parts.length < 3) return;

        const deviceId = parts[1];
        const type = parts[2];

        if (type === 'status') {
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
            const { createClient } = require('@supabase/supabase-js');
            const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

            // We update and select back to get the app_id
            const { data: result } = await supabase
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

        // 3. Notify via Scoped Socket.IO
        try {
            const io = getIo();
            const payload = {
                eventType: 'UPDATE',
                new: { device_id: deviceId, status: isOnline, last_seen: new Date().toISOString(), app_id: appId }
            };

            const { realtimeRegistry } = require('./realtimeRegistry');
            const isHighScale = realtimeRegistry.getSystemConfig()?.highScaleMode;

            if (!isHighScale) {
                io.emit('device_change', payload);
            }

            // Always emit to specific device room, the 'admin' channel, and the app-specific room
            io.to(`device-${deviceId}`).emit('device_change', payload);
            io.to('admin-dashboard').emit('device_change', payload);
            if (appId) {
                io.to(`app-${appId}`).emit('device_change', payload);
            }
        } catch (err) { }
    }

    private async handleNewSms(deviceId: string, payload: string) {
        sysLogger.debug(`[MqttBridge] New SMS via MQTT for device: ${deviceId}`);

        try {
            const smsData = JSON.parse(payload);
            const io = getIo();

            const socketPayload = {
                eventType: 'INSERT',
                new: { ...smsData, device_id: deviceId, _source: 'mqtt' }
            };

            const { realtimeRegistry } = require('./realtimeRegistry');
            if (!realtimeRegistry.getSystemConfig()?.highScaleMode) {
                io.emit('message_change', socketPayload);
            }

            io.to(`messages-${deviceId}`).emit('message_change', socketPayload);
            io.to('admin-messages').emit('message_change', socketPayload);
        } catch (err) {
            sysLogger.error(err, `[MqttBridge] Failed to parse/relay SMS for ${deviceId}`);
        }
    }

    private async handleTelemetry(deviceId: string, payload: string) {
        try {
            const data = JSON.parse(payload);
            sysLogger.debug(`[MqttBridge] 💓 Heartbeat (Telemetry) from: ${deviceId}`);

            await presenceService.markOnline(deviceId);

            const { realtimeRegistry } = require('./realtimeRegistry');
            const isHighScale = realtimeRegistry.getSystemConfig()?.highScaleMode;

            let appId: string | null = null;

            // ⚡ THROTTLED DB UPDATE: Skip SQL if in high-scale mode to save IOPS
            if (!isHighScale) {
                const { createClient } = require('@supabase/supabase-js');
                const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);
                const { data: device } = await supabase
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

            const io = getIo();
            const socketPayload = {
                eventType: 'UPDATE',
                new: { ...data, device_id: deviceId, last_seen: new Date().toISOString(), app_id: appId }
            };

            if (!isHighScale) {
                io.emit('device_change', socketPayload);
            }
            io.to(`device-${deviceId}`).emit('device_change', socketPayload);
            io.to('admin-dashboard').emit('device_change', socketPayload);
            if (appId) {
                io.to(`app-${appId}`).emit('device_change', socketPayload);
            }
        } catch (err) {
            sysLogger.error(err, `[MqttBridge] Failed to process telemetry for ${deviceId}`);
        }
    }

    shutdown() {
        if (this.client) {
            this.client.end(true);
            this.client = null;
            sysLogger.info('[MqttBridge] Bridge shut down.');
        }
    }
}

export const mqttBridge = new MqttBridge();
