import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { asyncHandler } from '../../middleware/errorHandler';
import { authenticate } from '../../middleware/auth';
import { firebaseService } from '../../services/firebase.service';
import config from '../../config/env';
import logger from '../../utils/logger';
import { io } from '../../index';

const router = Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

/**
 * POST /api/v1/external/data
 * Fetch data from external Firebase database
 */
router.post('/data', authenticate, asyncHandler(async (req: Request, res: Response) => {
    let { databaseUrl, path, action = 'read', appId, data: writeData } = req.body;

    // Automatically resolve databaseUrl from appId if provided
    if (appId && !databaseUrl) {
        try {
            const { data: app } = await supabase
                .from('app_builder_apps')
                .select('database_provider_id')
                .eq('id', appId)
                .maybeSingle();

            if (app?.database_provider_id) {
                const { data: provider } = await supabase
                    .from('database_providers')
                    .select('config')
                    .eq('id', app.database_provider_id)
                    .maybeSingle();

                if (provider?.config) {
                    const config = provider.config as any;
                    databaseUrl = config.databaseUrl || config.url || config.firebase_url;
                }
            }
        } catch (err) {
            logger.error(`Failed to resolve appId ${appId}:`, err);
        }
    }

    if (!databaseUrl || !path) {
        // Special case for action: 'devices' which might not need a path if appId is provided
        if (action === 'devices' && appId) {
            // Forward to the devices listing logic
            return res.redirect(307, '/api/v1/cloud-phones/data/devices?appId=' + appId);
        }

        return res.status(400).json({
            success: false,
            error: 'databaseUrl and path required'
        });
    }

    try {
        const result = await firebaseService.proxy(
            action as 'read' | 'write' | 'delete',
            databaseUrl,
            path,
            writeData
        );

        return res.json({ success: true, data: result });
    } catch (error: any) {
        logger.error('External data fetch error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
}));

/**
 * POST /api/v1/external/events
 * Receive real-time events from external providers (Relay)
 */
router.post('/events', asyncHandler(async (req: Request, res: Response) => {
    const { type, data, source, apiKey } = req.body;

    // Simple security check (could be enhanced)
    if (apiKey && process.env.EXTERNAL_NOTIFY_API_KEY && apiKey !== process.env.EXTERNAL_NOTIFY_API_KEY) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    logger.debug(`[External Event] Type: ${type}, Source: ${source}, Device: ${data?.device_id}`);

    // Broadcast to main panel's clients via internal Socket.IO
    if (type === 'device_change') {
        io.emit('device_change', { eventType: 'UPDATE', new: data });
        if (data.device_id) {
            io.to(`device-${data.device_id}`).emit('device_change', { eventType: 'UPDATE', new: data });
        }
    } else if (type === 'message_change') {
        io.emit('message_change', { eventType: 'INSERT', new: data });
        if (data.device_id) {
            io.to(`messages-${data.device_id}`).emit('message_change', { eventType: 'INSERT', new: data });
        }
    }

    return res.json({ success: true });
}));


export default router;
