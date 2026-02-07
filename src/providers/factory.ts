import { createClient } from '@supabase/supabase-js';
import config from '../config/env';
import sysLogger from '../utils/logger';
import { IDeviceProvider } from './base';
import { SupabaseProvider } from './supabase.provider';
import { FirebaseProvider } from './firebase.provider';
import { SocketIOProvider } from './socketio.provider';
import { NullProvider } from './null.provider';
import { encryptionService } from '../services/encryption.service';

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

export class ProviderFactory {
    static async getProvider(appId?: string): Promise<IDeviceProvider> {
        if (!appId || appId === 'undefined' || appId === 'null') {
            return new NullProvider();
        }

        // Fetch app details to identify provider
        sysLogger.debug(`[ProviderFactory] Fetching app details for appId: ${appId}`);
        const { data: app, error } = await supabase
            .from('app_builder_apps')
            .select('*')
            .eq('id', appId)
            .single();

        if (error || !app) {
            sysLogger.error(`[ProviderFactory] App not found or error for ${appId}: ${error?.message}`);
            return new NullProvider();
        }

        const providerType = (app.db_provider_type || '').toUpperCase();
        sysLogger.debug(`[ProviderFactory] Resolved providerType: ${providerType} for app: ${app.name || appId}`);

        if (providerType === 'FIREBASE') {
            try {
                const appConfig = encryptionService.decrypt(app.encrypted_config) as any;
                if (appConfig?.firebase?.databaseURL) {
                    return new FirebaseProvider(appConfig.firebase.databaseURL, appId);
                }
            } catch (err) {
                sysLogger.error('Decryption error for firebase provider:', { err });
            }
        }

        if (providerType === 'SOCKETIO' || providerType === 'SOCKET_IO') {
            try {
                const appConfig = encryptionService.decrypt(app.encrypted_config) as any;
                const socketUrl = appConfig?.socketio?.serverUrl ||
                    appConfig?.socketio?.url ||
                    appConfig?.socketio_server_url;

                sysLogger.debug(`[ProviderFactory] Resolved SocketIO URL: ${socketUrl} for appId: ${appId}`);

                if (socketUrl) {
                    return new SocketIOProvider(socketUrl, appId);
                }
            } catch (err) {
                sysLogger.error('Decryption error for socketio provider:', { err });
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
            sysLogger.error(`Error resolving provider for device ${deviceId}:`, { err });
        }

        // Fallback to null provider
        return this.getProvider();
    }

    /**
     * Get provider for a device ONLY if it belongs to the specified user
     */
    static async getProviderForUser(deviceId: string, userId: string, appId?: string): Promise<IDeviceProvider | null> {
        try {
            // 1. Identify valid AppId for this device
            let targetAppId = appId;
            if (!targetAppId) {
                const { data: device } = await supabase
                    .from('devices')
                    .select('app_id')
                    .eq('device_id', deviceId)
                    .maybeSingle();
                targetAppId = device?.app_id;
            }

            if (!targetAppId) return null;

            // 2. Verify ownership of the app
            const { data: app, error } = await supabase
                .from('app_builder_apps')
                .select('owner_id')
                .eq('id', targetAppId)
                .single();

            if (error || !app || String(app.owner_id) !== String(userId)) {
                sysLogger.warn(`Ownership check FAILED for user ${userId} on device ${deviceId}. App Owner: ${app?.owner_id}, Requester: ${userId}`);
                return null;
            }

            // 3. Return provider
            return this.getProvider(targetAppId);
        } catch (err) {
            sysLogger.error(`Error in getProviderForUser for device ${deviceId}, user ${userId}:`, { err });
            return null;
        }
    }
}
