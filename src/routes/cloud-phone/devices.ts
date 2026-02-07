import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import config from '../../config/env';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import logger from '../../utils/logger';
import { io } from '../../index';

const router = Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

/**
 * GET /api/v1/cloud-phones/devices
 * List all cloud phone devices with metadata
 */
router.get('/', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { geelarkPhoneId, linkedDeviceId, autoForwardEnabled, limit = 100 } = req.query;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    let query = supabase
        .from('cloud_phone_devices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(Number(limit));

    if (!isAdmin) {
        // Find all app IDs owned by this user
        const { data: userApps } = await supabase
            .from('app_builder_apps')
            .select('id')
            .eq('owner_id', userId);
        const appIds = (userApps || []).map(a => a.id);

        if (appIds.length === 0) {
            return res.json({ success: true, devices: [] });
        }

        // Find all device IDs for these apps
        const { data: userDevices } = await supabase
            .from('devices')
            .select('device_id')
            .in('app_id', appIds);
        const deviceIds = (userDevices || []).map(d => d.device_id);

        if (deviceIds.length === 0) {
            return res.json({ success: true, devices: [] });
        }

        query = query.in('linked_device_id', deviceIds);
    }

    if (geelarkPhoneId) {
        query = query.eq('geelark_phone_id', geelarkPhoneId);
    }

    if (linkedDeviceId) {
        query = query.eq('linked_device_id', linkedDeviceId);
    }

    if (autoForwardEnabled !== undefined) {
        query = query.eq('auto_forward_enabled', autoForwardEnabled === 'true');
    }

    const { data: devices, error } = await query;

    if (error) throw error;

    return res.json({
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
 * GET /api/v1/cloud-phones/devices/:geelarkPhoneId
 * Get single cloud phone device metadata
 */
router.get('/:geelarkPhoneId', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { geelarkPhoneId } = req.params;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    const { data: device, error } = await supabase
        .from('cloud_phone_devices')
        .select('*')
        .eq('geelark_phone_id', geelarkPhoneId)
        .maybeSingle();

    if (error) throw error;

    if (!device) {
        return res.status(404).json({
            success: false,
            error: 'Device not found',
        });
    }

    // Verify ownership if not admin
    if (!isAdmin && device.linked_device_id) {
        const { data: dbDevice } = await supabase
            .from('devices')
            .select('app_id')
            .eq('device_id', device.linked_device_id)
            .single();

        if (dbDevice) {
            const { data: app } = await supabase
                .from('app_builder_apps')
                .select('owner_id')
                .eq('id', dbDevice.app_id)
                .single();

            if (!app || String(app.owner_id) !== String(userId)) {
                return res.status(403).json({ success: false, error: 'Forbidden: You do not own this cloud phone' });
            }
        }
    }

    if (error) throw error;

    if (!device) {
        return res.status(404).json({
            success: false,
            error: 'Device not found',
        });
    }

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
 * PUT /api/v1/cloud-phones/devices/:geelarkPhoneId
 * Update cloud phone device metadata
 */
router.put('/:geelarkPhoneId', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { geelarkPhoneId } = req.params;
    const {
        linkedDeviceId,
        bankAssigned,
        loginDoneAt,
        phoneNumber,
        metadata,
        balance,
        upiPin,
        autoForwardEnabled,
    } = req.body;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    // Verify ownership if not admin
    if (!isAdmin) {
        // If they are linking a device, check if they own that device
        if (linkedDeviceId) {
            const { data: device } = await supabase
                .from('devices')
                .select('app_id')
                .eq('device_id', linkedDeviceId)
                .single();

            if (device) {
                const { data: app } = await supabase
                    .from('app_builder_apps')
                    .select('owner_id')
                    .eq('id', device.app_id)
                    .single();

                if (!app || String(app.owner_id) !== String(userId)) {
                    return res.status(403).json({ success: false, error: 'Forbidden: You do not own the device you are trying to link' });
                }
            }
        }

        // If it's an existing device, check current ownership
        const { data: existingDevice } = await supabase
            .from('cloud_phone_devices')
            .select('linked_device_id')
            .eq('geelark_phone_id', geelarkPhoneId)
            .maybeSingle();

        if (existingDevice?.linked_device_id) {
            const { data: origDevice } = await supabase
                .from('devices')
                .select('app_id')
                .eq('device_id', existingDevice.linked_device_id)
                .single();

            if (origDevice) {
                const { data: app } = await supabase
                    .from('app_builder_apps')
                    .select('owner_id')
                    .eq('id', origDevice.app_id)
                    .single();

                if (!app || String(app.owner_id) !== String(userId)) {
                    return res.status(403).json({ success: false, error: 'Forbidden: You do not own this cloud phone mapping' });
                }
            }
        }
    }

    const updates: any = {
        updated_at: new Date().toISOString(),
    };

    if (linkedDeviceId !== undefined) updates.linked_device_id = linkedDeviceId;
    if (bankAssigned !== undefined) updates.bank_assigned = bankAssigned;
    if (loginDoneAt !== undefined) updates.login_done_at = loginDoneAt;
    if (phoneNumber !== undefined) updates.phone_number = phoneNumber;
    if (metadata !== undefined) updates.metadata = metadata;
    if (balance !== undefined) updates.balance = balance;
    if (upiPin !== undefined) updates.upi_pin = upiPin;
    if (autoForwardEnabled !== undefined) updates.auto_forward_enabled = autoForwardEnabled;

    // Check if device exists
    const { data: existing } = await supabase
        .from('cloud_phone_devices')
        .select('geelark_phone_id')
        .eq('geelark_phone_id', geelarkPhoneId)
        .maybeSingle();

    let result;
    if (existing) {
        // Update existing
        const { data, error } = await supabase
            .from('cloud_phone_devices')
            .update(updates)
            .eq('geelark_phone_id', geelarkPhoneId)
            .select()
            .single();

        if (error) throw error;
        result = data;
    } else {
        // Create new
        const { data, error } = await supabase
            .from('cloud_phone_devices')
            .insert({
                geelark_phone_id: geelarkPhoneId,
                ...updates,
            })
            .select()
            .single();

        if (error) throw error;
        result = data;
    }

    // Emit real-time update
    io.emit('device_change', { eventType: existing ? 'UPDATE' : 'INSERT', new: result });
    io.to(`device-${geelarkPhoneId}`).emit('device_change', { eventType: existing ? 'UPDATE' : 'INSERT', new: result });

    return res.json({
        success: true,
        device: {
            geelarkPhoneId: result.geelark_phone_id,
            linkedDeviceId: result.linked_device_id,
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
 * POST /api/v1/cloud-phones/devices/bulk/auto-forward
 * Bulk toggle auto-forward for multiple devices
 */
router.post('/bulk/auto-forward', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { phoneIds, enabled } = req.body;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    if (!Array.isArray(phoneIds) || phoneIds.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'phoneIds array is required',
        });
    }

    // For non-admins, verify that all phoneIds belong to them
    if (!isAdmin) {
        const { data: userApps } = await supabase.from('app_builder_apps').select('id').eq('owner_id', userId);
        const appIds = (userApps || []).map(a => a.id);
        const { data: userDevices } = await supabase.from('devices').select('device_id').in('app_id', appIds);
        const deviceIds = (userDevices || []).map(d => d.device_id);

        const { data: targetDevices } = await supabase.from('cloud_phone_devices').select('geelark_phone_id, linked_device_id').in('geelark_phone_id', phoneIds);
        const allOwned = (targetDevices || []).every(d => d.linked_device_id && deviceIds.includes(d.linked_device_id));

        if (!allOwned || (targetDevices || []).length !== phoneIds.length) {
            return res.status(403).json({ success: false, error: 'Forbidden: One or more devices do not belong to you' });
        }
    }

    if (typeof enabled !== 'boolean') {
        return res.status(400).json({
            success: false,
            error: 'enabled boolean is required',
        });
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

    // Emit real-time update for each device
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
 * DELETE /api/v1/cloud-phones/devices/:geelarkPhoneId
 * Delete cloud phone device metadata
 */
router.delete('/:geelarkPhoneId', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { geelarkPhoneId } = req.params;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    // Verify ownership if not admin
    if (!isAdmin) {
        const { data: device } = await supabase.from('cloud_phone_devices').select('linked_device_id').eq('geelark_phone_id', geelarkPhoneId).maybeSingle();
        if (device?.linked_device_id) {
            const { data: dbDevice } = await supabase.from('devices').select('app_id').eq('device_id', device.linked_device_id).single();
            if (dbDevice) {
                const { data: app } = await supabase.from('app_builder_apps').select('owner_id').eq('id', dbDevice.app_id).single();
                if (!app || String(app.owner_id) !== String(userId)) {
                    return res.status(403).json({ success: false, error: 'Forbidden: You do not own this cloud phone' });
                }
            }
        }
    }

    const { error } = await supabase
        .from('cloud_phone_devices')
        .delete()
        .eq('geelark_phone_id', geelarkPhoneId);

    if (error) throw error;

    logger.info(`Device deleted: ${geelarkPhoneId}`);

    // Emit real-time update
    io.emit('device_change', { eventType: 'DELETE', old: { geelark_phone_id: geelarkPhoneId } });
    io.to(`device-${geelarkPhoneId}`).emit('device_change', { eventType: 'DELETE', old: { geelark_phone_id: geelarkPhoneId } });

    return res.json({
        success: true,
        message: 'Device deleted successfully',
    });
}));

export default router;
