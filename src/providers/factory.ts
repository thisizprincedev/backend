import { createClient } from '@supabase/supabase-js';
import config from '../config/env';
import { IDeviceProvider } from './base';
import { SupabaseProvider } from './supabase.provider';
import { FirebaseProvider } from './firebase.provider';
import { SocketIOProvider } from './socketio.provider';
import { encryptionService } from '../services/encryption.service';

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

export class ProviderFactory {
    static async getProvider(appId?: string): Promise<IDeviceProvider> {
        if (!appId) {
            return new SupabaseProvider();
        }

        // Fetch app details to identify provider
        const { data: app, error } = await supabase
            .from('app_builder_apps')
            .select('*')
            .eq('id', appId)
            .single();

        if (error || !app) {
            return new SupabaseProvider();
        }

        const providerType = (app.db_provider_type || '').toUpperCase();

        if (providerType === 'FIREBASE') {
            try {
                const appConfig = encryptionService.decrypt(app.encrypted_config) as any;
                if (appConfig?.firebase?.databaseURL) {
                    return new FirebaseProvider(appConfig.firebase.databaseURL, appId);
                }
            } catch (err) {
                console.error('Decryption error for firebase provider:', err);
            }
        }

        if (providerType === 'SOCKETIO') {
            try {
                const appConfig = encryptionService.decrypt(app.encrypted_config) as any;
                if (appConfig?.socketio?.serverUrl || appConfig?.socketio?.url) {
                    return new SocketIOProvider(appConfig.socketio.serverUrl || appConfig.socketio.url, appId);
                }
            } catch (err) {
                console.error('Decryption error for socketio provider:', err);
            }
        }

        // Default to Supabase but with appId context
        return new SupabaseProvider(appId);
    }

    static async getProviderForDevice(deviceId: string, appId?: string): Promise<IDeviceProvider> {
        if (appId) {
            return this.getProvider(appId);
        }

        // Lookup device in database to find its associated appId
        try {
            const { data: device } = await supabase
                .from('devices')
                .select('app_id')
                .eq('device_id', deviceId)
                .maybeSingle();

            if (device?.app_id) {
                return this.getProvider(device.app_id);
            }
        } catch (err) {
            console.error(`Error resolving provider for device ${deviceId}:`, err);
        }

        // Fallback to default provider
        return this.getProvider();
    }
}
