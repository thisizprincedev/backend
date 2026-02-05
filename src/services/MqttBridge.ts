import mqtt from 'mqtt';
import config from '../config/env';
import logger from '../utils/logger';
import { presenceService } from './PresenceService';
import { getIo } from '../socket';

export class MqttBridge {
    private client: mqtt.MqttClient | null = null;

    init() {
        if (this.client) {
            logger.warn('[MqttBridge] Bridge already initialized.');
            return;
        }

        console.log(`📡 [MqttBridge] Initializing bridge for ${config.mqtt.url}`);
        logger.info(`[MqttBridge] Connecting to MQTT Broker: ${config.mqtt.url}`);

        this.client = mqtt.connect(config.mqtt.url, {
            username: config.mqtt.username || config.nats.user,
            password: config.mqtt.password || config.nats.pass,
            clientId: `br_backend_${config.env}_${Math.random().toString(16).slice(2, 6)}`,
            clean: true,
            connectTimeout: 60000,
            keepalive: 60,
            reconnectPeriod: 5000,
            protocolVersion: 4, // ⚠️ CRITICAL: Force MQTT 3.1.1 (Required for NATS)
        });

        logger.info({
            url: config.mqtt.url,
            clientId: this.client.options.clientId,
            username: config.mqtt.username || config.nats.user
        }, '[MqttBridge] Attempting MQTT connection...');

        this.client.on('connect', () => {
            logger.info('[MqttBridge] Connected to MQTT Broker 🚀');
            // Try broad subscription for debugging
            this.client?.subscribe('devices/#', (err) => {
                if (err) logger.error(err, '[MqttBridge] Subscribe Error');
                else logger.info('[MqttBridge] Subscribed to devices/#');
            });
        });

        this.client.on('message', (topic, message) => {
            console.log(`[DEBUG] MQTT RECV -> Topic: ${topic}, Payload: ${message.toString()}`);
            logger.info(`[MqttBridge] 📥 Received: ${topic}`);
            this.handleMessage(topic, message.toString());
        });

        this.client.on('error', (err) => {
            logger.error(err, '[MqttBridge] MQTT Error');
        });

        this.client.on('reconnect', () => {
            logger.warn('[MqttBridge] MQTT Reconnecting...');
        });

        this.client.on('offline', () => {
            logger.warn('[MqttBridge] MQTT Client Offline');
        });

        this.client.on('close', () => {
            logger.info('[MqttBridge] MQTT Connection Closed');
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
        logger.info(`[MqttBridge] ${icon} Device ${status.toUpperCase()}: ${deviceId}`);

        // 1. Update Redis Presence (Instant source of truth)
        if (isOnline) {
            await presenceService.markOnline(deviceId);
        } else {
            await presenceService.markOffline(deviceId);
        }

        // 2. Throttled SQL Persistence (Update DB only every 5 mins or on status change)
        // For simplicity in this step, we update status immediately but we'll flag telemetry for throttling
        const { realtimeRegistry } = require('./realtimeRegistry');
        const isHighScale = realtimeRegistry.getSystemConfig()?.highScaleMode;

        if (!isHighScale || !isOnline) {
            // In high scale mode, we still want to know if they go offline immediately in DB
            // but we can be more lenient with 'online' pulses
            try {
                const { createClient } = require('@supabase/supabase-js');
                const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);
                await supabase.from('devices').update({
                    status: isOnline,
                    last_seen: new Date().toISOString()
                }).eq('device_id', deviceId);
            } catch (err) {
                logger.error(`[MqttBridge] DB Status update failed for ${deviceId}`);
            }
        }

        // 3. Notify via Scoped Socket.IO (No global broadcast in high-scale)
        try {
            const io = getIo();
            const payload = {
                eventType: 'UPDATE',
                new: { device_id: deviceId, status: isOnline, last_seen: new Date().toISOString() }
            };

            if (!isHighScale) {
                io.emit('device_change', payload);
            }
            // Always emit to specific device room and the 'admin' channel
            io.to(`device-${deviceId}`).emit('device_change', payload);
            io.to('admin-dashboard').emit('device_change', payload);
        } catch (err) { }
    }

    private async handleNewSms(deviceId: string, payload: string) {
        logger.info(`[MqttBridge] New SMS via MQTT for device: ${deviceId}`);

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
            logger.error(err, `[MqttBridge] Failed to parse/relay SMS for ${deviceId}`);
        }
    }

    private async handleTelemetry(deviceId: string, payload: string) {
        try {
            const data = JSON.parse(payload);
            logger.info(`[MqttBridge] 💓 Heartbeat (Telemetry) from: ${deviceId}`);

            await presenceService.markOnline(deviceId);

            const { realtimeRegistry } = require('./realtimeRegistry');
            const isHighScale = realtimeRegistry.getSystemConfig()?.highScaleMode;

            // ⚡ THROTTLED DB UPDATE: Skip SQL if in high-scale mode to save IOPS
            // Redis is already updated via markOnline
            if (!isHighScale) {
                const { createClient } = require('@supabase/supabase-js');
                const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);
                await supabase.from('devices').update({
                    heartbeat: data,
                    last_seen: new Date().toISOString()
                }).eq('device_id', deviceId);
            }

            const io = getIo();
            const socketPayload = {
                eventType: 'UPDATE',
                new: { ...data, device_id: deviceId, last_seen: new Date().toISOString() }
            };

            if (!isHighScale) {
                io.emit('device_change', socketPayload);
            }
            io.to(`device-${deviceId}`).emit('device_change', socketPayload);
            io.to('admin-dashboard').emit('device_change', socketPayload);
        } catch (err) {
            logger.error(err, `[MqttBridge] Failed to process telemetry for ${deviceId}`);
        }
    }

    shutdown() {
        if (this.client) {
            this.client.end(true);
            this.client = null;
            logger.info('[MqttBridge] Bridge shut down.');
        }
    }
}

export const mqttBridge = new MqttBridge();
