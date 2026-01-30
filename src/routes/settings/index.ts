import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import config from '../../config/env';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import logger from '../../utils/logger';

const router = Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

/**
 * GET /api/v1/settings/global
 * List all global configurations (admin only)
 */
router.get('/global', authenticate, asyncHandler(async (_req: Request, res: Response) => {
    const { data: configs, error } = await supabase
        .from('global_config')
        .select('*')
        .order('config_key');

    if (error) throw error;

    res.json({
        success: true,
        configs: configs.map(config => {
            let parsedValue = config.config_value;
            if (typeof parsedValue === 'string') {
                try {
                    parsedValue = JSON.parse(parsedValue);
                } catch (e) {
                    // Not JSON, keep as string
                }
            }
            return {
                key: config.config_key,
                value: parsedValue,
                updatedBy: config.updated_by,
                updatedAt: config.updated_at,
            };
        }),
    });
}));

/**
 * GET /api/v1/settings/global/:key
 * Get specific global configuration (admin only)
 */
router.get('/global/:key', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { key } = req.params;

    const { data: config, error } = await supabase
        .from('global_config')
        .select('*')
        .eq('config_key', key)
        .maybeSingle();

    if (error) throw error;

    if (!config) {
        return res.status(404).json({
            success: false,
            error: 'Configuration not found',
        });
    }

    let parsedValue = config.config_value;
    if (typeof parsedValue === 'string') {
        try {
            parsedValue = JSON.parse(parsedValue);
        } catch (e) {
            // Not JSON
        }
    }

    return res.json({
        success: true,
        config: {
            key: config.config_key,
            value: parsedValue,
            updatedBy: config.updated_by,
            updatedAt: config.updated_at,
        },
    });
}));

/**
 * POST /api/v1/settings/global/:key
 * Create or update global configuration (admin only)
 */
router.post('/global/:key', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { key } = req.params;
    const { value } = req.body;
    const userId = req.user!.id;

    if (!value) {
        return res.status(400).json({
            success: false,
            error: 'Configuration value is required',
        });
    }

    // Check if config exists
    const { data: existing } = await supabase
        .from('global_config')
        .select('id')
        .eq('config_key', key)
        .maybeSingle();

    let result;
    if (existing) {
        // Update existing
        const { data, error } = await supabase
            .from('global_config')
            .update({
                config_value: value,
                updated_by: userId,
                updated_at: new Date().toISOString(),
            })
            .eq('config_key', key)
            .select()
            .single();

        if (error) throw error;
        result = data;
    } else {
        // Create new
        const { data, error } = await supabase
            .from('global_config')
            .insert({
                config_key: key,
                config_value: value,
                updated_by: userId,
            })
            .select()
            .single();

        if (error) throw error;
        result = data;
    }

    logger.info(`Global config ${existing ? 'updated' : 'created'}: ${key} by user ${userId}`);

    let resultValue = result.config_value;
    if (typeof resultValue === 'string') {
        try {
            resultValue = JSON.parse(resultValue);
        } catch (e) {
            // Not JSON
        }
    }

    return res.json({
        success: true,
        config: {
            key: result.config_key,
            value: resultValue,
            updatedBy: result.updated_by,
            updatedAt: result.updated_at,
        },
    });
}));

/**
 * DELETE /api/v1/settings/global/:key
 * Delete global configuration (admin only)
 */
router.delete('/global/:key', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { key } = req.params;

    const { error } = await supabase
        .from('global_config')
        .delete()
        .eq('config_key', key);

    if (error) throw error;

    logger.info(`Global config deleted: ${key} by user ${req.user!.id}`);

    res.json({
        success: true,
        message: 'Configuration deleted successfully',
    });
}));

export default router;
