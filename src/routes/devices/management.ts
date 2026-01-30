import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import config from '../../config/env';
import { authenticate, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';

const router = Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

const adminOnly = [authenticate, requireRole(['admin'])];

/**
 * GET /api/v1/devices
 * List all devices with optional filtering
 */
router.get('/', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { status, appId, limit = 100 } = req.query;

    let query = supabase
        .from('devices')
        .select('*')
        .order('last_seen', { ascending: false })
        .limit(Number(limit));

    if (status) {
        query = query.eq('status', status === 'true');
    }

    if (appId) {
        const { data: assignments, error: assignError } = await supabase
            .from('device_app_assignments')
            .select('device_id')
            .eq('app_id', appId);

        if (assignError) throw assignError;

        const deviceIds = (assignments || []).map(a => a.device_id);
        if (deviceIds.length === 0) {
            return res.json({ success: true, devices: [] });
        }

        query = query.in('device_id', deviceIds);
    }

    const { data, error } = await query;
    if (error) throw error;

    return res.json({ success: true, devices: data });
}));

/**
 * GET /api/v1/devices/:deviceId
 * Get single device details
 */
router.get('/:deviceId', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;

    const { data, error } = await supabase
        .from('devices')
        .select('*')
        .eq('device_id', deviceId)
        .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Device not found' });

    return res.json({ success: true, device: data });
}));

/**
 * GET /api/v1/devices/:deviceId/stats
 * Get counts for messages, apps, etc.
 */
router.get('/:deviceId/stats', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;

    const [msgCount, appCount] = await Promise.all([
        supabase.from('sms_messages').select('*', { count: 'exact', head: true }).eq('device_id', deviceId),
        supabase.from('installed_apps').select('*', { count: 'exact', head: true }).eq('device_id', deviceId)
    ]);

    return res.json({
        success: true,
        stats: {
            messages: msgCount.count || 0,
            apps: appCount.count || 0
        }
    });
}));

export default router;
