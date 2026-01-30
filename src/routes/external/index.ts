import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { asyncHandler } from '../../middleware/errorHandler';
import { authenticate } from '../../middleware/auth';
import { firebaseService } from '../../services/firebase.service';
import config from '../../config/env';
import logger from '../../utils/logger';

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
 * POST /api/v1/external/devices
 * Fetch devices from external source
 */
router.post('/devices', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { databaseUrl, path = 'clients' } = req.body;

    if (!databaseUrl) {
        return res.status(400).json({
            success: false,
            error: 'databaseUrl required'
        });
    }

    try {
        const devices = await firebaseService.read(databaseUrl, path);
        return res.json({ success: true, devices });
    } catch (error: any) {
        logger.error('External devices fetch error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
}));

/**
 * POST /api/v1/external/command
 * Send command to external system
 */
router.post('/command', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { databaseUrl, deviceId, command } = req.body;

    if (!databaseUrl || !deviceId || !command) {
        return res.status(400).json({
            success: false,
            error: 'databaseUrl, deviceId, and command required'
        });
    }

    try {
        const path = `clients/${deviceId}/commands`;
        await firebaseService.write(databaseUrl, path, command);

        return res.json({ success: true });
    } catch (error: any) {
        logger.error('External command error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
}));

export default router;
