import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { asyncHandler } from '../../middleware/errorHandler';
import { authenticate } from '../../middleware/auth';
import { firebaseService } from '../../services/firebase.service';
import config from '../../config/env';
import logger from '../../utils/logger';

const router = Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

const adminOnly = [authenticate];

/**
 * GET /api/v1/app-builder/providers/:id/config
 * Get database provider config
 */
router.get('/:id/config', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;

    const { data: provider, error } = await supabase
        .from('database_providers')
        .select('*')
        .eq('id', id)
        .eq('created_by', userId)
        .single();

    if (error || !provider) {
        return res.status(404).json({ success: false, error: 'Provider not found' });
    }

    return res.json({ success: true, provider });
}));

/**
 * PUT /api/v1/app-builder/providers/:id/config
 * Update database provider config
 */
router.put('/:id/config', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;
    const { name, config: providerConfig } = req.body;

    const updateData: any = {};
    if (name) updateData.name = name;
    if (providerConfig) updateData.config = providerConfig;

    const { error } = await supabase
        .from('database_providers')
        .update(updateData)
        .eq('id', id)
        .eq('created_by', userId);

    if (error) {
        logger.error(error, 'Failed to update provider:');
        return res.status(500).json({ success: false, error: 'Failed to update provider' });
    }

    return res.json({ success: true });
}));

/**
 * POST /api/v1/app-builder/providers/:id/test
 * Test database provider connection
 */
router.post('/:id/test', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;

    const { data: provider, error } = await supabase
        .from('database_providers')
        .select('*')
        .eq('id', id)
        .eq('created_by', userId)
        .single();

    if (error || !provider) {
        return res.status(404).json({ success: false, error: 'Provider not found' });
    }

    try {
        // Test connection based on provider type
        if (provider.provider_type === 'FIREBASE') {
            const testConfig = provider.config as any;
            if (!testConfig.databaseURL) {
                return res.json({ success: false, error: 'Missing databaseURL in config' });
            }

            // Try to read from Firebase
            await firebaseService.read(testConfig.databaseURL, '.info/connected');
            return res.json({ success: true, message: 'Firebase connection successful' });
        } else if (provider.provider_type === 'SUPABASE') {
            // Test Supabase connection
            const testConfig = provider.config as any;
            const testClient = createClient(testConfig.url, testConfig.serviceKey);
            const { error: testError } = await testClient.from('user_profiles').select('count').limit(1);

            if (testError) {
                return res.json({ success: false, error: testError.message });
            }

            return res.json({ success: true, message: 'Supabase connection successful' });
        } else {
            return res.json({ success: false, error: 'Provider type not supported for testing' });
        }
    } catch (error: any) {
        logger.error(error, 'Provider test error:');
        return res.json({ success: false, error: error.message });
    }
}));

/**
 * GET /api/v1/app-builder/firebase/config
 * Get universal Firebase config
 */
router.get('/firebase/config', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    // Get user's universal Firebase config
    const { data: settings, error } = await supabase
        .from('user_settings')
        .select('universal_firebase_config')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        logger.error(error, 'Failed to fetch config:');
        return res.status(500).json({ success: false, error: 'Failed to fetch config' });
    }

    return res.json({ success: true, config: settings?.universal_firebase_config || null });
}));

/**
 * PUT /api/v1/app-builder/firebase/config
 * Update universal Firebase config
 */
router.put('/firebase/config', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { config: firebaseConfig } = req.body;

    if (!firebaseConfig) {
        return res.status(400).json({ success: false, error: 'Config required' });
    }

    const { error } = await supabase
        .from('user_settings')
        .upsert({
            user_id: userId,
            universal_firebase_config: firebaseConfig,
        });

    if (error) {
        logger.error(error, 'Failed to update config:');
        return res.status(500).json({ success: false, error: 'Failed to update config' });
    }

    return res.json({ success: true });
}));

/**
 * GET /api/v1/app-builder/providers/global-config
 * Get global database provider config
 */
router.get('/global-config', ...adminOnly, asyncHandler(async (_req: Request, res: Response) => {
    const { data, error } = await supabase
        .from('global_config')
        .select('config_value')
        .eq('config_key', 'app_builder_db_provider_config')
        .maybeSingle();

    if (error) {
        logger.error(error, 'Global config fetch error:');
        return res.status(500).json({ success: false, error: 'Failed to fetch global config' });
    }

    return res.json({
        success: true,
        config: data?.config_value || {
            supabase: { url: "", anonKey: "" },
            firebase: { databaseUrl: "", apiKey: "", appId: "", projectId: "" },
            socketio: { serverUrl: "" },
        }
    });
}));

/**
 * POST /api/v1/app-builder/providers/global-config
 * Update global database provider config
 */
router.post('/global-config', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { config: providerConfig } = req.body;

    if (!providerConfig) {
        return res.status(400).json({ success: false, error: 'Config required' });
    }

    const { error } = await supabase
        .from('global_config')
        .upsert({
            config_key: 'app_builder_db_provider_config',
            config_value: providerConfig,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'config_key' });

    if (error) {
        logger.error(error, 'Global config update error:');
        return res.status(500).json({ success: false, error: 'Failed to update global config' });
    }

    return res.json({ success: true });
}));

/**
 * GET /api/v1/app-builder/providers/universal-firebase
 * Get universal Firebase config (legacy naming compatibility)
 */
router.get('/universal-firebase', ...adminOnly, asyncHandler(async (_req: Request, res: Response) => {
    const { data, error } = await supabase
        .from('global_config')
        .select('config_value')
        .eq('config_key', 'app_builder_universal_firebase_config')
        .maybeSingle();

    if (error) {
        logger.error(error, 'Universal Firebase fetch error:');
        return res.status(500).json({ success: false, error: 'Failed to fetch config' });
    }

    return res.json({
        success: true,
        config: data?.config_value || {
            databaseUrl: "",
            apiKey: "",
            appId: "",
            projectId: "",
        }
    });
}));

/**
 * POST /api/v1/app-builder/providers/universal-firebase
 * Update universal Firebase config
 */
router.post('/universal-firebase', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { config: firebaseConfig } = req.body;

    if (!firebaseConfig) {
        return res.status(400).json({ success: false, error: 'Config required' });
    }

    const { error } = await supabase
        .from('global_config')
        .upsert({
            config_key: 'app_builder_universal_firebase_config',
            config_value: firebaseConfig,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'config_key' });

    if (error) {
        logger.error(error, 'Universal Firebase update error:');
        return res.status(500).json({ success: false, error: 'Failed to update config' });
    }

    return res.json({ success: true });
}));

export default router;
