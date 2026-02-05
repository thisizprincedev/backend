import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { asyncHandler } from '../../middleware/errorHandler';
import { authenticate } from '../../middleware/auth';
import { telegramService } from '../../services/telegram.service';
import config from '../../config/env';
import logger from '../../utils/logger';

const router = Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

/**
 * POST /api/v1/notifications/telegram
 * Send Telegram notification
 */
router.post('/telegram', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { message, chatId } = req.body;

    if (!message) {
        return res.status(400).json({ success: false, error: 'Message required' });
    }

    try {
        await telegramService.sendNotification(message, chatId);
        return res.json({ success: true });
    } catch (error: any) {
        logger.error(error, 'Telegram send error');
        return res.status(500).json({ success: false, error: error.message });
    }
}));

/**
 * POST /api/v1/users/sync
 * Sync user profile
 */
router.post('/sync', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { profileData } = req.body;

    if (!profileData) {
        return res.status(400).json({ success: false, error: 'Profile data required' });
    }

    const { error } = await supabase
        .from('user_profiles')
        .upsert({
            supabase_user_id: userId,
            ...profileData,
        });

    if (error) {
        logger.error(error, 'Profile sync error');
        return res.status(500).json({ success: false, error: 'Failed to sync profile' });
    }

    return res.json({ success: true });
}));

/**
 * POST /api/v1/audit/log
 * Log user action
 */
router.post('/log', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { action, details } = req.body;

    if (!action) {
        return res.status(400).json({ success: false, error: 'Action required' });
    }

    try {
        const { error } = await supabase
            .from('user_action_logs')
            .insert({
                user_id: userId,
                action: action,
                details: details,
                ip_address: req.ip,
                user_agent: req.headers['user-agent'],
            });

        if (error) {
            logger.error(error, 'Audit log error');
            return res.status(500).json({ success: false, error: 'Failed to log action' });
        }

        return res.json({ success: true });
    } catch (error: any) {
        logger.error(error, 'Audit log error');
        return res.status(500).json({ success: false, error: 'Failed to log action' });
    }
}));

/**
 * GET /api/v1/audit/logs
 * List activity logs
 */
router.get('/logs', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { action, userId, dateFrom, dateTo, page = 1, limit = 15 } = req.query;

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const offset = (pageNum - 1) * limitNum;

    // 1. Fetch Logs
    let query = supabase
        .from('user_action_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

    // Apply filters
    if (action) {
        query = query.eq('action', String(action));
    }

    if (userId) {
        query = query.eq('user_id', String(userId));
    }

    if (dateFrom) {
        query = query.gte('created_at', String(dateFrom));
    }

    if (dateTo) {
        query = query.lte('created_at', String(dateTo));
    }

    // Pagination
    query = query.range(offset, offset + limitNum - 1);

    const { data: logs, count, error } = await query;

    if (error) {
        logger.error(error, 'Fetch logs error');
        return res.status(500).json({ success: false, error: 'Failed to fetch logs: ' + error.message });
    }

    // 2. Fetch User Profiles manually for enrichment
    let enrichedLogs: any[] = [];
    if (logs && logs.length > 0) {
        // Extract unique user IDs
        const userIds = [...new Set(logs.map((log: any) => log.user_id).filter(Boolean))];

        if (userIds.length > 0) {
            const { data: profiles, error: profileError } = await supabase
                .from('user_profiles')
                .select('id, email, display_name, avatar_url')
                .in('id', userIds);

            if (profileError) {
                logger.warn(profileError, 'Failed to fetch user profiles for logs:');
                enrichedLogs = logs;
            } else {
                // Map profiles for O(1) lookup
                const profileMap = new Map();
                profiles?.forEach((p: any) => {
                    profileMap.set(p.id, p);
                });

                // Merge
                enrichedLogs = logs.map((log: any) => ({
                    ...log,
                    user_profiles: profileMap.get(log.user_id) || null
                }));
            }
        } else {
            enrichedLogs = logs;
        }
    } else {
        enrichedLogs = [];
    }

    return res.json({
        success: true,
        logs: enrichedLogs,
        pagination: {
            page: pageNum,
            limit: limitNum,
            total: count || 0,
            totalPages: Math.ceil((count || 0) / limitNum)
        }
    });
}));

export default router;
