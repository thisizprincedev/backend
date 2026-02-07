import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import config from '../../config/env';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { io } from '../../index';
import { ProviderFactory } from '../../providers/factory';
import { presenceService } from '../../services/PresenceService';
import { realtimeRegistry } from '../../services/realtimeRegistry';

const router = Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

/**
 * GET /api/v1/devices
 * List all devices with optional filtering
 */
router.get('/', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { status, limit = 100 } = req.query;
    const appId = typeof req.query.appId === 'string' ? req.query.appId : undefined;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    // If not admin, we must ensure the requested appId belongs to the user,
    // or if no appId is requested, we fetch devices for all apps owned by the user.
    let targetAppIds: string[] = [];
    if (appId) {
        if (!isAdmin) {
            const { data: appOwner } = await supabase
                .from('app_builder_apps')
                .select('owner_id')
                .eq('id', appId)
                .single();
            if (!appOwner || appOwner.owner_id !== userId) {
                return res.status(403).json({ success: false, error: 'Forbidden: App not owned by you' });
            }
        }
        targetAppIds = [appId];
    } else if (!isAdmin) {
        // Fetch all app IDs owned by this user
        const { data: userApps } = await supabase
            .from('app_builder_apps')
            .select('id')
            .eq('owner_id', userId);
        targetAppIds = (userApps || []).map(a => a.id);

        if (targetAppIds.length === 0) {
            return res.json({ success: true, devices: [], message: 'No apps found for user' });
        }
    }

    // If targetAppIds is empty and we are admin, we fetch all (appId is undefined)
    // If not empty, we might need a modified provider logic to fetch from multiple apps,
    // but for now let's assume one appId or all from the default provider.

    const provider = await ProviderFactory.getProvider(appId);
    let devices = await provider.listDevices(Number(limit));

    // If we have multiple apps but used a single provider (NullProvider or Supabase),
    // we should filter the devices here.
    if (targetAppIds.length > 0 && !appId) {
        devices = devices.filter(d => targetAppIds.includes(d.app_id));
    }

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
router.get('/:deviceId', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const deviceId = String(req.params.deviceId);
    const queryAppId = req.query.appId;
    const appId = typeof queryAppId === 'string' ? queryAppId : undefined;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    let provider;
    if (isAdmin) {
        provider = await ProviderFactory.getProvider(appId);
    } else {
        provider = await ProviderFactory.getProviderForUser(deviceId, userId, appId);
        if (!provider) {
            return res.status(403).json({ success: false, error: 'Forbidden: You do not own this device' });
        }
    }

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
router.get('/:deviceId/stats', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const deviceId = String(req.params.deviceId);
    const queryAppId = req.query.appId;
    const appId = typeof queryAppId === 'string' ? queryAppId : undefined;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    let provider;
    if (isAdmin) {
        provider = await ProviderFactory.getProvider(appId);
    } else {
        provider = await ProviderFactory.getProviderForUser(deviceId, userId, appId);
        if (!provider) {
            return res.status(403).json({ success: false, error: 'Forbidden: You do not own this device' });
        }
    }

    const stats = await provider.getDeviceStats(deviceId);

    return res.json({ success: true, stats });
}));

/**
 * PATCH /api/v1/devices/:deviceId
 * Update device details (note, is_bookmarked)
 */
router.patch('/:deviceId', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const deviceId = req.params.deviceId as string;
    const { note, is_bookmarked, appId: bodyAppId } = req.body;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    // Verify ownership if not admin
    if (!isAdmin) {
        const provider = await ProviderFactory.getProviderForUser(deviceId, userId, bodyAppId as string | undefined);
        if (!provider) {
            return res.status(403).json({ success: false, error: 'Forbidden: You do not own this device' });
        }
    }

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
    const socketPayload = { eventType: 'UPDATE', new: { ...data, app_id: appId || data.app_id } };
    if (!realtimeRegistry.getSystemConfig()?.highScaleMode) {
        io.emit('device_change', socketPayload);
    }
    io.to(`device-${deviceId}`).emit('device_change', socketPayload);
    io.to('admin-dashboard').emit('device_change', socketPayload);
    if (appId || data.app_id) {
        io.to(`app-${appId || data.app_id}`).emit('device_change', socketPayload);
    }

    return res.json({ success: true, device: data });
}));

/**
 * POST /api/v1/devices/:deviceId/send-sms
 * Send SMS from device
 */
router.post('/:deviceId/send-sms', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const deviceId = String(req.params.deviceId);
    const { phoneNumber, message, simIndex = 0, appId: bodyAppId } = req.body;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    if (!phoneNumber || !message) {
        return res.status(400).json({ success: false, error: 'phoneNumber and message are required' });
    }

    let provider;
    if (isAdmin) {
        provider = await ProviderFactory.getProvider(bodyAppId);
    } else {
        provider = await ProviderFactory.getProviderForUser(deviceId, userId, bodyAppId as string | undefined);
        if (!provider) {
            return res.status(403).json({ success: false, error: 'Forbidden: You do not own this device' });
        }
    }

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
