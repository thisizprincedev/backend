import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import config from '../../config/env';
import { authenticate, requireRole } from '../../middleware/auth';
import logger from '../../utils/logger';

const router = Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

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
        logger.error('List users error:', error.message);
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
        if (req.user?.id.toString() !== id.toString() && req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { data: user, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
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
            },
        });
    } catch (error: any) {
        logger.error('Get user error:', error.message);
        return res.status(500).json({ error: 'Failed to get user' });
    }
});

/**
 * Update user profile
 * PATCH /api/v1/users/:id
 */
router.patch('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { displayName, telegramChatId, geelarkApiKey, role } = req.body;

        // Users can only update their own profile unless admin
        if (req.user?.id.toString() !== id.toString() && req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        // Only admins can change roles
        if (role && req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Only admins can change roles' });
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
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        return res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                displayName: user.display_name,
                role: user.role,
            },
        });
    } catch (error: any) {
        logger.error('Update user error:', error.message);
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
        logger.error('Delete user error:', error.message);
        return res.status(500).json({ error: 'Failed to delete user' });
    }
});

/**
 * Create admin user (admin only)
 * POST /api/v1/users/admin
 */
router.post('/admin', authenticate, requireRole(['admin']), async (req, res) => {
    try {
        const { email, password, displayName } = req.body;

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
            logger.error('Admin user creation auth error:', authError);
            return res.status(400).json({
                success: false,
                error: authError.message
            });
        }

        // Create user profile with admin role
        // Standardizing: id is autoincremented BigInt, we map auth ID to supabase_user_id
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .insert({
                supabase_user_id: authData.user.id,
                email,
                display_name: displayName || email.split('@')[0],
                role: 'admin',
                firebase_uid: authData.user.id
            })
            .select()
            .single();

        if (profileError) {
            logger.error('Admin user profile creation error:', profileError);
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
                role: 'admin'
            }
        });
    } catch (error: any) {
        logger.error('Create admin user error:', error.message);
        return res.status(500).json({
            success: false,
            error: 'Failed to create admin user'
        });
    }
});

export default router;
