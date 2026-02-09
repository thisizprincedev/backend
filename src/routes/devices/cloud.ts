import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import config from '../../config/env';
import { authenticate, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import logger from '../../utils/logger';
import { realtimeRegistry } from '../../services/realtimeRegistry';

const router = Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

const adminOnly = [authenticate, requireRole(['admin'])];

/**
 * GET /api/v1/devices/cloud/mappings
 * List all cloud phone device mappings
 */
router.get('/mappings', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { geelarkPhoneId, linkedDeviceId, autoForwardEnabled, limit = 100 } = req.query;

    let query = supabase
        .from('cloud_phone_devices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(Number(limit));

    if (geelarkPhoneId) query = query.eq('geelark_phone_id', geelarkPhoneId);
    if (linkedDeviceId) query = query.eq('linked_device_id', linkedDeviceId);
    if (autoForwardEnabled !== undefined) query = query.eq('auto_forward_enabled', autoForwardEnabled === 'true');

    const { data: devices, error } = await query;
    if (error) throw error;

    res.json({
        success: true,
        devices: devices.map(device => ({
            geelarkPhoneId: device.geelark_phone_id,
            linkedDeviceId: device.linked_device_id,
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
            linkedDeviceId: device.linked_device_id,
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
        linkedDeviceId, linked_device_id,
        firebaseDeviceId, firebase_device_id,
        firebaseId, firebase_id,
        bankAssigned, bank_assigned,
        loginDoneAt, login_done_at,
        phoneNumber, phone_number,
        metadata,
        balance,
        upiPin, upi_pin,
        autoForwardEnabled, auto_forward_enabled,
    } = req.body;

    const updates: any = { updated_at: new Date().toISOString() };

    const effectiveLinkedDeviceId = [linkedDeviceId, linked_device_id, firebaseDeviceId, firebase_device_id, firebaseId, firebase_id].find(v => v !== undefined);
    if (effectiveLinkedDeviceId !== undefined) updates.linked_device_id = effectiveLinkedDeviceId;

    const effectiveBankAssigned = [bankAssigned, bank_assigned].find(v => v !== undefined);
    if (effectiveBankAssigned !== undefined) updates.bank_assigned = effectiveBankAssigned;

    const effectiveLoginDoneAt = [loginDoneAt, login_done_at].find(v => v !== undefined);
    if (effectiveLoginDoneAt !== undefined) updates.login_done_at = effectiveLoginDoneAt;

    const effectivePhoneNumber = [phoneNumber, phone_number].find(v => v !== undefined);
    if (effectivePhoneNumber !== undefined) updates.phone_number = effectivePhoneNumber;

    if (metadata !== undefined) updates.metadata = metadata;
    if (balance !== undefined) updates.balance = balance;

    const effectiveUpiPin = [upiPin, upi_pin].find(v => v !== undefined);
    if (effectiveUpiPin !== undefined) updates.upi_pin = effectiveUpiPin;

    const effectiveAutoForward = [autoForwardEnabled, auto_forward_enabled].find(v => v !== undefined);
    if (effectiveAutoForward !== undefined) updates.auto_forward_enabled = effectiveAutoForward;

    const { data: existing } = await supabase
        .from('cloud_phone_devices')
        .select('geelark_phone_id')
        .eq('geelark_phone_id', geelarkPhoneId)
        .maybeSingle();

    const result = existing
        ? (async () => {
            const { data, error } = await supabase
                .from('cloud_phone_devices')
                .update(updates)
                .eq('geelark_phone_id', geelarkPhoneId)
                .select()
                .single();
            if (error) throw error;
            return data;
        })()
        : (async () => {
            const { data, error } = await supabase
                .from('cloud_phone_devices')
                .insert({ geelark_phone_id: geelarkPhoneId, ...updates })
                .select()
                .single();
            if (error) throw error;
            return data;
        })();

    const data = await result;

    // RELAY VIA optimized Registry (Batched)
    realtimeRegistry.relayDeviceUpdate(data, existing ? 'UPDATE' : 'INSERT');

    res.json({
        success: true,
        device: {
            geelarkPhoneId: data.geelark_phone_id,
            linkedDeviceId: data.linked_device_id,
            bankAssigned: data.bank_assigned,
            loginDoneAt: data.login_done_at,
            phoneNumber: data.phone_number,
            metadata: data.metadata,
            balance: data.balance,
            upiPin: data.upi_pin,
            autoForwardEnabled: data.auto_forward_enabled,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
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

    // RELAY VIA optimized Registry (Batched)
    data.forEach((device: any) => {
        realtimeRegistry.relayDeviceUpdate(device, 'UPDATE');
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

    // RELAY VIA optimized Registry (Batched)
    realtimeRegistry.relayDeviceUpdate({ geelark_phone_id: geelarkPhoneId }, 'DELETE');

    res.json({ success: true, message: 'Mapping deleted successfully' });
}));

export default router;
