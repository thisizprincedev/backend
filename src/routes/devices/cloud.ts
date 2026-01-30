import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import config from '../../config/env';
import { authenticate, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import logger from '../../utils/logger';
import { io } from '../../index';

const router = Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

const adminOnly = [authenticate, requireRole(['admin'])];

/**
 * GET /api/v1/devices/cloud/mappings
 * List all cloud phone device mappings
 */
router.get('/mappings', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { geelarkPhoneId, firebaseDeviceId, autoForwardEnabled, limit = 100 } = req.query;

    let query = supabase
        .from('cloud_phone_devices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(Number(limit));

    if (geelarkPhoneId) query = query.eq('geelark_phone_id', geelarkPhoneId);
    if (firebaseDeviceId) query = query.eq('firebase_device_id', firebaseDeviceId);
    if (autoForwardEnabled !== undefined) query = query.eq('auto_forward_enabled', autoForwardEnabled === 'true');

    const { data: devices, error } = await query;
    if (error) throw error;

    res.json({
        success: true,
        devices: devices.map(device => ({
            geelarkPhoneId: device.geelark_phone_id,
            firebaseDeviceId: device.firebase_device_id,
            bankAssigned: device.bank_assigned,
            loginDoneAt: device.login_done_at,
            phoneNumber: device.phone_number,
            metadata: device.metadata,
            balance: device.balance,
            upiPin: device.upi_pin,
            autoForwardEnabled: device.auto_forward_enabled,
            createdAt: device.created_at,
            updatedAt: device.updated_at,
        })),
    });
}));

/**
 * GET /api/v1/devices/cloud/mappings/:geelarkPhoneId
 * Get single cloud phone device mapping
 */
router.get('/mappings/:geelarkPhoneId', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { geelarkPhoneId } = req.params;

    const { data: device, error } = await supabase
        .from('cloud_phone_devices')
        .select('*')
        .eq('geelark_phone_id', geelarkPhoneId)
        .maybeSingle();

    if (error) throw error;
    if (!device) return res.status(404).json({ success: false, error: 'Mapping not found' });

    return res.json({
        success: true,
        device: {
            geelarkPhoneId: device.geelark_phone_id,
            firebaseDeviceId: device.firebase_device_id,
            bankAssigned: device.bank_assigned,
            loginDoneAt: device.login_done_at,
            phoneNumber: device.phone_number,
            metadata: device.metadata,
            balance: device.balance,
            upiPin: device.upi_pin,
            autoForwardEnabled: device.auto_forward_enabled,
            createdAt: device.created_at,
            updatedAt: device.updated_at,
        },
    });
}));

/**
 * PUT /api/v1/devices/cloud/mappings/:geelarkPhoneId
 * Update/Create cloud phone device mapping
 */
router.put('/mappings/:geelarkPhoneId', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { geelarkPhoneId } = req.params;
    const {
        firebaseDeviceId,
        bankAssigned,
        loginDoneAt,
        phoneNumber,
        metadata,
        balance,
        upiPin,
        autoForwardEnabled,
    } = req.body;

    const updates: any = { updated_at: new Date().toISOString() };

    if (firebaseDeviceId !== undefined) updates.firebase_device_id = firebaseDeviceId;
    if (bankAssigned !== undefined) updates.bank_assigned = bankAssigned;
    if (loginDoneAt !== undefined) updates.login_done_at = loginDoneAt;
    if (phoneNumber !== undefined) updates.phone_number = phoneNumber;
    if (metadata !== undefined) updates.metadata = metadata;
    if (balance !== undefined) updates.balance = balance;
    if (upiPin !== undefined) updates.upi_pin = upiPin;
    if (autoForwardEnabled !== undefined) updates.auto_forward_enabled = autoForwardEnabled;

    const { data: existing } = await supabase
        .from('cloud_phone_devices')
        .select('geelark_phone_id')
        .eq('geelark_phone_id', geelarkPhoneId)
        .maybeSingle();

    let result;
    if (existing) {
        const { data, error } = await supabase
            .from('cloud_phone_devices')
            .update(updates)
            .eq('geelark_phone_id', geelarkPhoneId)
            .select()
            .single();
        if (error) throw error;
        result = data;
    } else {
        const { data, error } = await supabase
            .from('cloud_phone_devices')
            .insert({ geelark_phone_id: geelarkPhoneId, ...updates })
            .select()
            .single();
        if (error) throw error;
        result = data;
    }

    io.emit('device_change', { eventType: existing ? 'UPDATE' : 'INSERT', new: result });
    io.to(`device-${geelarkPhoneId}`).emit('device_change', { eventType: existing ? 'UPDATE' : 'INSERT', new: result });

    res.json({
        success: true,
        device: {
            geelarkPhoneId: result.geelark_phone_id,
            firebaseDeviceId: result.firebase_device_id,
            bankAssigned: result.bank_assigned,
            loginDoneAt: result.login_done_at,
            phoneNumber: result.phone_number,
            metadata: result.metadata,
            balance: result.balance,
            upiPin: result.upi_pin,
            autoForwardEnabled: result.auto_forward_enabled,
            createdAt: result.created_at,
            updatedAt: result.updated_at,
        },
    });
}));

/**
 * POST /api/v1/devices/cloud/bulk/auto-forward
 * Bulk toggle auto-forward
 */
router.post('/bulk/auto-forward', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { phoneIds, enabled } = req.body;

    if (!Array.isArray(phoneIds) || phoneIds.length === 0) {
        return res.status(400).json({ success: false, error: 'phoneIds array is required' });
    }

    if (typeof enabled !== 'boolean') {
        return res.status(400).json({ success: false, error: 'enabled boolean is required' });
    }

    const { data, error } = await supabase
        .from('cloud_phone_devices')
        .update({
            auto_forward_enabled: enabled,
            updated_at: new Date().toISOString(),
        })
        .in('geelark_phone_id', phoneIds)
        .select();

    if (error) throw error;

    logger.info(`Bulk auto-forward ${enabled ? 'enabled' : 'disabled'} for ${phoneIds.length} devices`);

    // Emit real-time updates
    data.forEach((device: any) => {
        io.emit('device_change', { eventType: 'UPDATE', new: device });
        io.to(`device-${device.geelark_phone_id}`).emit('device_change', { eventType: 'UPDATE', new: device });
    });

    return res.json({
        success: true,
        message: `Auto-forward ${enabled ? 'enabled' : 'disabled'} for ${data.length} devices`,
        updatedCount: data.length,
    });
}));

/**
 * DELETE /api/v1/devices/cloud/mappings/:geelarkPhoneId
 * Delete cloud phone device mapping
 */
router.delete('/mappings/:geelarkPhoneId', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { geelarkPhoneId } = req.params;

    const { error } = await supabase
        .from('cloud_phone_devices')
        .delete()
        .eq('geelark_phone_id', geelarkPhoneId);

    if (error) throw error;

    logger.info(`Device mapping deleted: ${geelarkPhoneId}`);

    io.emit('device_change', { eventType: 'DELETE', old: { geelark_phone_id: geelarkPhoneId } });
    io.to(`device-${geelarkPhoneId}`).emit('device_change', { eventType: 'DELETE', old: { geelark_phone_id: geelarkPhoneId } });

    res.json({ success: true, message: 'Mapping deleted successfully' });
}));

export default router;
