import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import config from '../../config/env';
import { authenticate, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { io } from '../../index';
import { ProviderFactory } from '../../providers/factory';
import { presenceService } from '../../services/PresenceService';
import { realtimeRegistry } from '../../services/realtimeRegistry';

const router = Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

const adminOnly = [authenticate, requireRole(['admin'])];

/**
 * GET /api/v1/devices
 * List all devices with optional filtering
 */
router.get('/', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { status, limit = 100 } = req.query;
    const appId = typeof req.query.appId === 'string' ? req.query.appId : undefined;

    const provider = await ProviderFactory.getProvider(appId);
    let devices = await provider.listDevices(Number(limit));

    // Merge status from Redis (PresenceService)
    const deviceIds = devices.map(d => d.device_id || d.id);
    const statuses = await presenceService.getStatuses(deviceIds);

    devices = devices.map(d => {
        const id = d.device_id || d.id;
        // Merge status: Use 'true' if EITHER backend OR provider says online
        const isOnline = (statuses[id] === true) || (d.status === true);
        return {
            ...d,
            status: isOnline
        };
    });

    if (status) {
        devices = devices.filter(d => d.status === (status === 'true'));
    }

    const { data: app } = await supabase
        .from('app_builder_apps')
        .select('id, name:app_name, provider_type:db_provider_type')
        .eq('id', appId)
        .maybeSingle();

    return res.json({ success: true, devices, app });
}));

/**
 * GET /api/v1/devices/:deviceId
 * Get single device details
 */
router.get('/:deviceId', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const deviceId = String(req.params.deviceId);
    const queryAppId = req.query.appId;
    const appId = typeof queryAppId === 'string' ? queryAppId : undefined;
    const provider = await ProviderFactory.getProvider(appId);
    let device = await provider.getDevice(deviceId);

    if (!device) return res.status(404).json({ success: false, error: 'Device not found' });

    // Merge status from Redis
    const isOnline = await presenceService.isOnline(deviceId);
    device = { ...device, status: isOnline };

    return res.json({ success: true, device });
}));

/**
 * GET /api/v1/devices/:deviceId/stats
 * Get counts for messages, apps, etc.
 */
router.get('/:deviceId/stats', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const deviceId = String(req.params.deviceId);
    const queryAppId = req.query.appId;
    const appId = typeof queryAppId === 'string' ? queryAppId : undefined;
    const provider = await ProviderFactory.getProvider(appId);
    const stats = await provider.getDeviceStats(deviceId);

    return res.json({ success: true, stats });
}));

/**
 * PATCH /api/v1/devices/:deviceId
 * Update device details (note, is_bookmarked)
 */
router.patch('/:deviceId', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const { note, is_bookmarked } = req.body;

    const updates: any = { updated_at: new Date().toISOString() };
    if (note !== undefined) updates.note = note;
    if (is_bookmarked !== undefined) updates.is_bookmarked = is_bookmarked;

    const appId = typeof req.body.appId === 'string' ? req.body.appId : undefined;
    const { data, error } = await supabase
        .from('devices')
        .upsert({ device_id: deviceId, ...updates }, { onConflict: 'device_id' })
        .select()
        .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(500).json({ success: false, error: 'Failed to update device' });

    // Ensure assignment exists if appId is provided
    if (appId) {
        try {
            await supabase
                .from('device_app_assignments')
                .upsert({
                    device_id: deviceId,
                    app_id: appId,
                    assigned_by: (req as any).user?.id || 'system'
                }, { onConflict: 'device_id,app_id' });
        } catch (err) {
            console.error('Failed to create assignment:', err);
        }

        // Return with app_id for frontend consistency
        data.app_id = appId;
    }

    // Emit real-time update
    if (!realtimeRegistry.getSystemConfig()?.highScaleMode) {
        io.emit('device_change', { eventType: 'UPDATE', new: data });
    }
    io.to(`device-${deviceId}`).emit('device_change', { eventType: 'UPDATE', new: data });
    io.to('admin-dashboard').emit('device_change', { eventType: 'UPDATE', new: data });

    return res.json({ success: true, device: data });
}));

/**
 * POST /api/v1/devices/:deviceId/send-sms
 * Send SMS from device
 */
router.post('/:deviceId/send-sms', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const deviceId = String(req.params.deviceId);
    const { phoneNumber, message, simIndex = 0 } = req.body;

    if (!phoneNumber || !message) {
        return res.status(400).json({ success: false, error: 'phoneNumber and message are required' });
    }

    const bodyAppId = req.body.appId;
    const appId = typeof bodyAppId === 'string' ? bodyAppId : undefined;
    const provider = await ProviderFactory.getProvider(appId);
    const cmd = await provider.sendCommand(deviceId, 'send_sms', {
        phone_number: phoneNumber,
        message: message,
        sim_index: simIndex
    });

    return res.json({
        success: true,
        message: 'SMS command sent',
        command: cmd
    });
}));

export default router;
