import mqtt from 'mqtt';
import config from '../config/env';
import logger from '../utils/logger';
import { presenceService } from './PresenceService';
import { getIo } from '../socket';

export class MqttBridge {
    private client: mqtt.MqttClient | null = null;

    init() {
        if (this.client) return;

        logger.info(`[MqttBridge] Connecting to MQTT Broker: ${config.mqtt.url}`);
        this.client = mqtt.connect(config.mqtt.url, {
            username: config.nats.user,
            password: config.nats.pass,
            clientId: `backend_bridge_${config.env}`,
            clean: true
        });

        this.client.on('connect', () => {
            logger.info('[MqttBridge] Connected to MQTT Broker');
            // Subscribe to all device status and sms topics
            // devices/+/status
            // devices/+/sms/new
            this.client?.subscribe('devices/+/status');
            this.client?.subscribe('devices/+/sms/new');
            this.client?.subscribe('devices/+/telemetry');
        });

        this.client.on('message', (topic, message) => {
            this.handleMessage(topic, message.toString());
        });

        this.client.on('error', (err) => {
            logger.error('[MqttBridge] MQTT Error:', err);
        });
    }

    private async handleMessage(topic: string, payload: string) {
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
        logger.info(`[MqttBridge] Status change for ${deviceId}: ${status}`);

        if (isOnline) {
            await presenceService.markOnline(deviceId);
        } else {
            await presenceService.markOffline(deviceId);
        }

        // Notify via Socket.IO
        try {
            const io = getIo();
            const payload = {
                eventType: 'UPDATE',
                new: { device_id: deviceId, status: isOnline, last_seen: new Date().toISOString() }
            };

            // Emit to Global
            io.emit('device_change', payload);
            // Emit to Device Room
            io.to(`device-${deviceId}`).emit('device_change', payload);
        } catch (err) {
            // Socket might not be ready yet
        }
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

            // Relay to global feed
            io.emit('message_change', socketPayload);

            // Relay to specific device room for messages
            io.to(`messages-${deviceId}`).emit('message_change', socketPayload);
        } catch (err) {
            logger.error(`[MqttBridge] Failed to parse/relay SMS for ${deviceId}:`, err);
        }
    }

    private async handleTelemetry(deviceId: string, payload: string) {
        try {
            const data = JSON.parse(payload);

            // Mark online since we just got telemetry
            await presenceService.markOnline(deviceId);

            const io = getIo();
            const socketPayload = {
                eventType: 'UPDATE',
                new: { ...data, device_id: deviceId, last_seen: new Date().toISOString() }
            };

            // Relay to Global
            io.emit('device_change', socketPayload);
            // Relay to Device Room
            io.to(`device-${deviceId}`).emit('device_change', socketPayload);
        } catch (err) {
            logger.error(`[MqttBridge] Failed to process telemetry for ${deviceId}:`, err);
        }
    }
}

export const mqttBridge = new MqttBridge();
