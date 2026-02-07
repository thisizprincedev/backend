import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import config from '../../config/env';
import { authenticate, requireRole } from '../../middleware/auth';
import logger from '../../utils/logger';
import { logActivity } from '../../utils/auditLogger';
import prisma from '../../lib/prisma';

const router = Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

const isValidUuid = (uuid: any): boolean => {
    return typeof uuid === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
};

/**
 * List all users (admin only)
 * GET /api/v1/users
 */
router.get('/', authenticate, requireRole(['admin']), async (_req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('user_profiles')
            .select('id, email, display_name, role, created_at, firebase_uid, is_2fa_enabled, avatar_url')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({
            success: true,
            users: users.map(user => ({
                id: user.id,
                email: user.email,
                displayName: user.display_name,
                role: user.role,
                createdAt: user.created_at,
                firebaseUid: user.firebase_uid,
                is2faEnabled: user.is_2fa_enabled,
                avatarUrl: user.avatar_url,
            })),
        });
    } catch (error: any) {
        logger.error(error, 'List users error');
        res.status(500).json({ error: 'Failed to list users' });
    }
});

/**
 * Get user profile
 * GET /api/v1/users/:id
 */
router.get('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        // Users can only view their own profile unless admin
        if (req.user?.id.toString() !== id.toString() && req.user?.uuid !== id && req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        let query = supabase
            .from('user_profiles')
            .select('*');

        if (/^\d+$/.test(id as string)) {
            query = query.eq('id', id as string);
        } else {
            query = query.eq('supabase_user_id', id as string);
        }

        const { data: user, error } = await query.maybeSingle();

        if (error) {
            logger.error(error, `Error fetching user ${id}:`);
            throw error;
        }

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Fetch settings using the UUID (supabase_user_id)
        let settings = null;
        if (isValidUuid(user.supabase_user_id)) {
            const { data } = await supabase
                .from('user_settings')
                .select('*')
                .eq('user_id', user.supabase_user_id)
                .maybeSingle();
            settings = data;
        }

        return res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                displayName: user.display_name,
                role: user.role,
                createdAt: user.created_at,
                firebaseUid: user.firebase_uid,
                telegramChatId: user.telegram_chat_id,
                geelarkApiKey: user.geelark_api_key,
                is2faEnabled: user.is_2fa_enabled,
                avatarUrl: user.avatar_url,
                settings: settings || null,
            },
        });
    } catch (error: any) {
        logger.error(error, 'Get user error');
        return res.status(500).json({ error: 'Failed to get user' });
    }
});

/**
 * Update user profile
 * PATCH /api/v1/users/:id
 */
router.patch('/:id', authenticate, async (req, res) => {
    try {
        const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
        const { displayName, telegramChatId, geelarkApiKey, role } = req.body;

        // Users can only update their own profile unless admin
        if (req.user?.id.toString() !== id.toString() && req.user?.uuid !== id && req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        // Only admins can change roles
        if (role && req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Only admins can change roles' });
        }

        let query = supabase
            .from('user_profiles')
            .select('id');

        if (/^\d+$/.test(id as string)) {
            query = query.eq('id', id as string);
        } else {
            query = query.eq('supabase_user_id', id as string);
        }

        const { data: profileToUpdate } = await query.maybeSingle();
        if (!profileToUpdate) {
            return res.status(404).json({ error: 'User not found' });
        }

        const updates: any = {};
        if (displayName !== undefined) updates.display_name = displayName;
        if (telegramChatId !== undefined) updates.telegram_chat_id = telegramChatId;
        if (geelarkApiKey !== undefined) updates.geelark_api_key = geelarkApiKey;
        if (role !== undefined) updates.role = role;
        if (req.body.is2faEnabled !== undefined) updates.is_2fa_enabled = req.body.is2faEnabled;
        if (req.body.avatarUrl !== undefined) updates.avatar_url = req.body.avatarUrl;
        if (req.body.email !== undefined && req.user?.role === 'admin') updates.email = req.body.email;

        const { data: user, error } = await supabase
            .from('user_profiles')
            .update(updates)
            .eq('id', profileToUpdate.id)
            .select()
            .single();

        if (error) {
            logger.error(error, `Error updating user profile ${id}:`);
            throw error;
        }

        // Handle settings upsert if provided
        if (req.body.settings && isValidUuid(user.supabase_user_id)) {
            const { error: settingsError } = await supabase
                .from('user_settings')
                .upsert({
                    user_id: user.supabase_user_id,
                    ...req.body.settings,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });

            if (settingsError) {
                logger.error(settingsError, `User settings upsert error for user ${id}:`);
                // We don't fail the whole request, but log it
            }
        }

        // Log profile update
        await logActivity({
            userId: user.supabase_user_id,
            action: 'profile_updated',
            details: {
                targetUserId: id,
                updatedFields: Object.keys(updates),
                hasSettingsUpdate: !!req.body.settings
            },
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });

        return res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                displayName: user.display_name,
                role: user.role,
                createdAt: user.created_at,
                firebaseUid: user.firebase_uid,
                telegramChatId: user.telegram_chat_id,
                geelarkApiKey: user.geelark_api_key,
                is2faEnabled: user.is_2fa_enabled,
                avatarUrl: user.avatar_url,
                settings: req.body.settings || null,
            },
        });
    } catch (error: any) {
        logger.error(error, 'Update user error');
        return res.status(500).json({ error: 'Failed to update user' });
    }
});

/**
 * Delete user (admin only)
 * DELETE /api/v1/users/:id
 */
router.delete('/:id', authenticate, requireRole(['admin']), async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('user_profiles')
            .delete()
            .eq('id', id);

        if (error) throw error;

        return res.json({
            success: true,
            message: 'User deleted successfully',
        });
    } catch (error: any) {
        logger.error(error, 'Delete user error');
        return res.status(500).json({ error: 'Failed to delete user' });
    }
});

/**
 * Create admin user (admin only)
 * POST /api/v1/users/admin
 */
router.post('/admin', authenticate, requireRole(['admin']), async (req, res) => {
    try {
        const { email, password, displayName, role = 'admin' } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password required'
            });
        }

        // Create user in Supabase auth
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                display_name: displayName || email.split('@')[0]
            }
        });

        if (authError) {
            logger.error(authError, 'User creation auth error:');
            return res.status(400).json({
                success: false,
                error: authError.message
            });
        }

        // Hash password for local database
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user profile with specified role
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .insert({
                supabase_user_id: authData.user.id,
                email,
                display_name: displayName || email.split('@')[0],
                role: role,
                firebase_uid: authData.user.id,
                password_hash: passwordHash
            })
            .select()
            .single();

        if (profileError) {
            logger.error(profileError, 'User profile creation error:');
            // Try to clean up the auth user if profile creation fails
            await supabase.auth.admin.deleteUser(authData.user.id);
            return res.status(500).json({
                success: false,
                error: 'Failed to create user profile'
            });
        }

        return res.json({
            success: true,
            user: {
                id: profile.id.toString(),
                email: profile.email,
                displayName: profile.display_name,
                role: profile.role
            }
        });
    } catch (error: any) {
        logger.error('Create user error:', error.message);
        return res.status(500).json({
            success: false,
            error: 'Failed to create user'
        });
    }
});


/**
 * Get user preference
 * GET /api/v1/users/:id/preferences/:type
 */
router.get('/:id/preferences/:type', authenticate, async (req, res) => {
    try {
        const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
        const type = (Array.isArray(req.params.type) ? req.params.type[0] : req.params.type) as string;

        // Users can only view their own preferences unless admin
        if (req.user?.id.toString() !== id && req.user?.uuid !== id && req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        let targetId: bigint;
        if (/^\d+$/.test(id)) {
            targetId = BigInt(id);
        } else {
            // Lookup numeric ID from UUID
            const profile = await prisma.user_profiles.findUnique({
                where: { supabase_user_id: id },
                select: { id: true }
            });
            if (!profile) return res.status(404).json({ error: 'User not found' });
            targetId = profile.id;
        }

        const prefs = await prisma.user_filter_preferences.findUnique({
            where: {
                user_id_preference_type: {
                    user_id: targetId,
                    preference_type: type
                }
            }
        });

        return res.json({
            success: true,
            preferences: prefs?.preferences || null
        });
    } catch (error: any) {
        logger.error('Get preferences error:', error.message);
        return res.status(500).json({ error: 'Failed to get preferences' });
    }
});

/**
 * Save user preference
 * POST /api/v1/users/:id/preferences/:type
 */
router.post('/:id/preferences/:type', authenticate, async (req, res) => {
    try {
        const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
        const type = (Array.isArray(req.params.type) ? req.params.type[0] : req.params.type) as string;
        const { preferences } = req.body;

        // Users can only save their own preferences unless admin
        if (req.user?.id.toString() !== id && req.user?.uuid !== id && req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        if (preferences === undefined) {
            return res.status(400).json({ error: 'Preferences payload required' });
        }

        let targetId: bigint;
        if (/^\d+$/.test(id)) {
            targetId = BigInt(id);
        } else {
            // Lookup numeric ID from UUID
            const profile = await prisma.user_profiles.findUnique({
                where: { supabase_user_id: id },
                select: { id: true }
            });
            if (!profile) return res.status(404).json({ error: 'User not found' });
            targetId = profile.id;
        }

        const result = await prisma.user_filter_preferences.upsert({
            where: {
                user_id_preference_type: {
                    user_id: targetId,
                    preference_type: type
                }
            },
            update: {
                preferences: preferences as any,
                updated_at: new Date()
            },
            create: {
                user_id: targetId,
                preference_type: type,
                preferences: preferences as any
            }
        });

        return res.json({
            success: true,
            message: 'Preferences saved successfully',
            data: {
                ...result,
                user_id: result.user_id.toString()
            }
        });
    } catch (error: any) {
        logger.error(error, 'Save preferences error');
        return res.status(500).json({ error: 'Failed to save preferences' });
    }
});

export default router;
