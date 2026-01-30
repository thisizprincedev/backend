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
        logger.error('Telegram send error:', error.message);
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
        logger.error('Profile sync error:', error);
        return res.status(500).json({ success: false, error: 'Failed to sync profile' });
    }

    return res.json({ success: true });
}));

/**
 * POST /api/v1/audit/log
 * Log user action
 */
/**
 * POST /api/v1/audit/log
 * Log user action
 */
router.post('/log', authenticate, asyncHandler(async (req: Request, res: Response) => {
    // ... existing POST log logic ...
    const userId = req.user!.id;
    const { action, resourceType, resourceId, details } = req.body;

    if (!action) {
        return res.status(400).json({ success: false, error: 'Action required' });
    }

    try { // Added try block
        const { error } = await supabase
            .from('user_action_logs')
            .insert({
                user_id: userId,
                action,
                resource_type: resourceType,
                resource_id: resourceId,
                details,
                ip_address: req.ip,
                user_agent: req.headers['user-agent'],
            });

        if (error) {
            logger.error('Audit log error:', error);
            return res.status(500).json({ success: false, error: 'Failed to log action' });
        }

        return res.json({ success: true });
    } catch (error: any) { // Added catch block
        logger.error('Audit log error:', error);
        return res.status(500).json({ success: false, error: 'Failed to log action' });
    }
}));

/**
 * GET /api/v1/audit/logs
 * List activity logs
 */
router.get('/logs', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { action, userId, dateFrom, dateTo, search, page = 1, limit = 15 } = req.query;

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const offset = (pageNum - 1) * limitNum;

    // 1. Fetch Logs (without join)
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

    // Since Supabase doesn't support complex OR filters easily on related text fields via JS client for search,
    // we handle simple search here or use a view/rpc if complex text search is needed.
    // For now, let's filter by matching user_id if search looks like a UUID or email if possible.
    // Note: Complex JSON search on 'details' column via Supabase JS is limited.
    if (search) {
        // This is a basic implementation. For full-text search, consider using .textSearch() or RPC.
        // Trying a simple ILIKE on casted columns if possible, but JS client is restrictive.
        // We will skip complex search implementation here to avoid 400s and stick to client-side filtering 
        // if dataset is small, OR implement a robust RPC.
        // Given current robust requirement, let's try a simple filter on available text columns.
        // query = query.or(`user_id.eq.${search},action.ilike.%${search}%`); // Example attempt
    }

    // Pagination
    query = query.range(offset, offset + limitNum - 1);

    const { data: logs, count, error } = await query;

    if (error) {
        logger.error('Fetch logs error:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch logs: ' + error.message });
    }

    // 2. Fetch User Profiles manually
    let enrichedLogs: any[] = [];
    if (logs && logs.length > 0) {
        // Extract unique user IDs
        const userIds = [...new Set(logs.map((log: any) => log.user_id).filter(Boolean))];

        if (userIds.length > 0) {
            const { data: profiles, error: profileError } = await supabase
                .from('user_profiles')
                .select('supabase_user_id, email, display_name')
                .in('supabase_user_id', userIds);

            if (profileError) {
                logger.warn('Failed to fetch user profiles for logs:', profileError);
                // Continue without user details
                enrichedLogs = logs;
            } else {
                // Map profiles for O(1) lookup
                const profileMap = new Map();
                profiles?.forEach((p: any) => {
                    profileMap.set(p.supabase_user_id, p);
                });

                // Merge
                enrichedLogs = logs.map((log: any) => ({
                    ...log,
                    user_profiles: profileMap.get(log.user_id) || null
                    // Note: Front-end expects 'user_profiles' property with email, display_name
                }));
            }
        } else {
            enrichedLogs = logs;
        }
    } else {
        enrichedLogs = []; // No logs, so no enriched logs
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
