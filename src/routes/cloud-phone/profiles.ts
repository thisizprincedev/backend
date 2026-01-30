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
 * GET /api/v1/cloud-phones/profiles
 * List user's cloud phone API profiles
 */
router.get('/', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const { data: profiles, error } = await supabase
        .from('cloud_phone_api_profiles')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

    if (error) throw error;

    res.json({
        success: true,
        profiles: profiles.map(profile => ({
            id: profile.id,
            name: profile.name,
            apiKey: profile.api_key,
            traceId: profile.trace_id,
            isActive: profile.is_active,
            isDefault: profile.is_default,
            createdAt: profile.created_at,
            userId: profile.user_id,
        })),
    });
}));

/**
 * GET /api/v1/cloud-phones/profiles/:id
 * Get single cloud phone API profile
 */
router.get('/:id', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;

    const { data: profile, error } = await supabase
        .from('cloud_phone_api_profiles')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw error;

    if (!profile) {
        return res.status(404).json({
            success: false,
            error: 'Profile not found',
        });
    }

    return res.json({
        success: true,
        profile: {
            id: profile.id,
            name: profile.name,
            apiKey: profile.api_key,
            traceId: profile.trace_id,
            isActive: profile.is_active,
            isDefault: profile.is_default,
            createdAt: profile.created_at,
            userId: profile.user_id,
        },
    });
}));

/**
 * POST /api/v1/cloud-phones/profiles
 * Create new cloud phone API profile
 */
router.post('/', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { name, apiKey, traceId, isActive, isDefault } = req.body;

    if (!name || !apiKey) {
        return res.status(400).json({ error: 'Name and API Key are required' });
    }

    // Check if this should be the first profile
    const { count } = await supabase
        .from('cloud_phone_api_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

    const isFirstProfile = count === 0;

    const { data: profile, error } = await supabase
        .from('cloud_phone_api_profiles')
        .insert({
            name,
            api_key: apiKey,
            trace_id: traceId || '',
            is_active: isActive !== undefined ? isActive : isFirstProfile,
            is_default: isDefault !== undefined ? isDefault : isFirstProfile,
            user_id: userId,
        })
        .select()
        .single();

    if (error) throw error;

    logger.info(`Cloud phone profile created: ${profile.id} for user ${userId}`);

    return res.json({
        success: true,
        profile: {
            id: profile.id,
            name: profile.name,
            apiKey: profile.api_key,
            traceId: profile.trace_id,
            isActive: profile.is_active,
            isDefault: profile.is_default,
            createdAt: profile.created_at,
            userId: profile.user_id,
        }
    });
}));

/**
 * PATCH /api/v1/cloud-phones/profiles/:id
 * Update cloud phone API profile
 */
router.patch('/:id', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;
    const updates = req.body;

    const dbUpdates: any = {
        updated_at: new Date().toISOString(),
    };

    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.apiKey !== undefined) dbUpdates.api_key = updates.apiKey;
    if (updates.traceId !== undefined) dbUpdates.trace_id = updates.traceId;
    if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
    if (updates.isDefault !== undefined) dbUpdates.is_default = updates.isDefault;

    const { data: profile, error } = await supabase
        .from('cloud_phone_api_profiles')
        .update(dbUpdates)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .maybeSingle();

    if (error) throw error;

    if (!profile) {
        return res.status(404).json({
            success: false,
            error: 'Profile not found',
        });
    }

    logger.info(`Cloud phone profile updated: ${id} by user ${userId}`);

    return res.json({
        success: true,
        profile: {
            id: profile.id,
            name: profile.name,
            apiKey: profile.api_key,
            traceId: profile.trace_id,
            isActive: profile.is_active,
            isDefault: profile.is_default,
            createdAt: profile.created_at,
            userId: profile.user_id,
        }
    });
}));

/**
 * POST /api/v1/cloud-phones/profiles/:id/activate
 * Set profile as active and deactivate others
 */
router.post('/:id/activate', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;

    // First, deactivate all profiles for this user
    const { error: deactivateError } = await supabase
        .from('cloud_phone_api_profiles')
        .update({ is_active: false })
        .eq('user_id', userId);

    if (deactivateError) throw deactivateError;

    // Then activate the selected one
    const { data: profile, error: activateError } = await supabase
        .from('cloud_phone_api_profiles')
        .update({ is_active: true })
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();

    if (activateError) throw activateError;

    logger.info(`Cloud phone profile activated: ${id} for user ${userId}`);

    return res.json({
        success: true,
        profile: {
            id: profile.id,
            name: profile.name,
            apiKey: profile.api_key,
            traceId: profile.trace_id,
            isActive: profile.is_active,
            isDefault: profile.is_default,
            createdAt: profile.created_at,
            userId: profile.user_id,
        }
    });
}));

/**
 * DELETE /api/v1/cloud-phones/profiles/:id
 * Delete cloud phone API profile
 */
router.delete('/:id', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;

    const { error } = await supabase
        .from('cloud_phone_api_profiles')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

    if (error) throw error;

    logger.info(`Cloud phone profile deleted: ${id} by user ${userId}`);

    return res.json({
        success: true,
        message: 'Profile deleted successfully',
    });
}));

export default router;
