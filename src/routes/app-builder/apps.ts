import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { asyncHandler } from '../../middleware/errorHandler';
import { authenticate } from '../../middleware/auth';
import { encryptionService } from '../../services/encryption.service';
import config from '../../config/env';
import logger from '../../utils/logger';
import { io } from '../../index';

const router = Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

const adminOnly = [authenticate];

/**
 * Validate version format (v1.0.0)
 */
function isValidVersion(v: string): boolean {
    return /^v\d+\.\d+\.\d+$/.test(v);
}

/**
 * Decode base64 data URL
 */
function decodeDataUrl(dataUrl: string): Buffer {
    const match = dataUrl.match(/^data:(.+);base64,(.*)$/);
    if (!match) throw new Error('Invalid data URL');
    const mime = match[1];
    if (mime !== 'image/png') throw new Error('Icon must be a PNG');
    return Buffer.from(match[2], 'base64');
}

/**
 * GET /api/v1/app-builder/apps
 * List all apps
 */
router.get('/', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const { data: apps, error } = await supabase
        .from('app_builder_apps')
        .select('*')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        logger.error('Error fetching apps:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch apps' });
    }

    return res.json({
        success: true,
        apps: apps.map(app => ({
            ...app,
            id: app.id.toString(),
            user_id: app.user_id?.toString(),
        }))
    });
}));

/**
 * POST /api/v1/app-builder/apps
 * Create new app
 */
router.post('/', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const {
        appName,
        packageName,
        version,
        dbProviderType,
        universalRealtime,
        iconBase64Png,
        config: appConfig
    } = req.body;

    // Validate required fields
    if (!appName || !packageName || !version || !dbProviderType) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields: appName, packageName, version, dbProviderType'
        });
    }

    if (!isValidVersion(version)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid version format (use v1.0.0)'
        });
    }

    // Get profile for the current user
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('id, role')
        .eq('id', userId)
        .single();

    if (!profile) {
        return res.status(404).json({ success: false, error: 'User profile not found' });
    }

    // Encrypt config
    const encryptedConfig = encryptionService.encrypt(appConfig || {});

    // Insert app
    const { data: inserted, error: insertError } = await supabase
        .from('app_builder_apps')
        .insert({
            user_id: profile.id,
            owner_id: userId,
            firebase_uid: userId,
            app_name: appName,
            package_name: packageName,
            version,
            db_provider_type: dbProviderType,
            encrypted_config: encryptedConfig,
            universal_realtime: Boolean(universalRealtime),
            build_status: 'queued',
        })
        .select('id')
        .single();

    if (insertError) {
        logger.error('Insert error:', insertError);
        return res.status(500).json({ success: false, error: 'Failed to create app' });
    }

    const appId = inserted.id;

    // Upload icon if provided
    if (iconBase64Png) {
        try {
            const bytes = decodeDataUrl(iconBase64Png);
            const iconPath = `${userId}/${appId}.png`;

            const { error: uploadError } = await supabase.storage
                .from('app-icons')
                .upload(iconPath, bytes, {
                    upsert: true,
                    contentType: 'image/png',
                });

            if (uploadError) {
                logger.error('Icon upload error:', uploadError);
            } else {
                await supabase
                    .from('app_builder_apps')
                    .update({ icon_bucket: 'app-icons', icon_path: iconPath })
                    .eq('id', appId);
            }
        } catch (error: any) {
            logger.error('Icon processing error:', error.message);
        }
    }

    // Trigger initial build automatically
    // We don't await this so the UI returns immediately, but we log errors if it fails
    triggerGitHubBuild(appId.toString(), userId).catch(async (err) => {
        logger.error('Auto-build trigger failed:', err);
        await supabase
            .from('app_builder_apps')
            .update({ build_status: 'failed', build_error: err.message })
            .eq('id', appId);
        io.to('app-builder').emit('app_change', { eventType: 'UPDATE', new: { id: appId.toString(), build_status: 'failed', build_error: err.message } });
    });

    // Emit real-time update
    io.to('app-builder').emit('app_change', { eventType: 'INSERT', new: { id: appId.toString(), app_name: appName, build_status: 'queued', owner_id: userId } });

    return res.json({ success: true, appId: appId.toString() });
}));

router.delete('/:id', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;

    const { error } = await supabase
        .from('app_builder_apps')
        .delete()
        .eq('id', id)
        .eq('owner_id', userId);

    if (error) {
        logger.error('Delete error:', error);
        return res.status(500).json({ success: false, error: 'Failed to delete app' });
    }

    // Emit real-time update
    io.to('app-builder').emit('app_change', { eventType: 'DELETE', old: { id: id.toString() } });

    return res.json({ success: true });
}));

/**
 * POST /api/v1/app-builder/apps/:id/clone
 * Clone app
 */
router.post('/:id/clone', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;

    // Get original app
    const { data: originalApp, error: fetchError } = await supabase
        .from('app_builder_apps')
        .select('*')
        .eq('id', id)
        .eq('owner_id', userId)
        .single();

    if (fetchError || !originalApp) {
        return res.status(404).json({ success: false, error: 'App not found' });
    }

    // Create clone
    const { data: cloned, error: cloneError } = await supabase
        .from('app_builder_apps')
        .insert({
            ...originalApp,
            id: undefined,
            app_name: `${originalApp.app_name} (Copy)`,
            package_name: `${originalApp.package_name}.copy`,
            build_status: 'queued',
            created_at: undefined,
            updated_at: undefined,
        })
        .select('id')
        .single();

    if (cloneError) {
        logger.error('Clone error:', cloneError);
        return res.status(500).json({ success: false, error: 'Failed to clone app' });
    }

    return res.json({ success: true, appId: cloned.id.toString() });
}));

/**
 * POST /api/v1/app-builder/apps/:id/build
 * Trigger build
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// ... existing imports ...

// Helper to trigger build (exported for use in other routes)
export async function triggerGitHubBuild(appId: string, userId: string) {
    const prisma = new PrismaClient();

    // Fetch GitHub config using Prisma
    const settings = await prisma.user_settings.findUnique({
        where: { user_id: userId },
        select: { github_workflow_config: true }
    });

    const githubConfig = settings?.github_workflow_config as any;

    if (!githubConfig || !githubConfig.owner || !githubConfig.repo || !githubConfig.pat) {
        throw new Error('GitHub configuration missing. Please configure it in settings.');
    }

    const { data: app, error: appError } = await supabase
        .from('app_builder_apps')
        .select('*')
        .eq('id', appId)
        .eq('owner_id', userId)
        .single();

    if (appError || !app) {
        throw new Error('App not found');
    }

    // Decrypt config
    let decryptedConfig: any = {};
    if (app.encrypted_config) {
        let configToDecrypt = app.encrypted_config;
        if (typeof configToDecrypt === 'string') {
            try { configToDecrypt = JSON.parse(configToDecrypt); } catch (e) { }
        }
        decryptedConfig = encryptionService.decrypt(configToDecrypt);
    }

    // Fetch Global Provider Configs
    const { data: globalProviderRow } = await supabase
        .from('global_config')
        .select('config_value')
        .eq('config_key', 'app_builder_db_provider_config')
        .maybeSingle();

    const globalProviderConfig = globalProviderRow?.config_value as any;

    if (globalProviderConfig) {
        const baseConfig: any = {};
        if (app.db_provider_type === 'SUPABASE' && globalProviderConfig.supabase) {
            baseConfig.supabase_url = globalProviderConfig.supabase.url;
            baseConfig.supabase_anon_key = globalProviderConfig.supabase.anonKey;
        } else if (app.db_provider_type === 'FIREBASE' && globalProviderConfig.firebase) {
            baseConfig.firebase_database_url = globalProviderConfig.firebase.databaseUrl;
            baseConfig.firebase_api_key = globalProviderConfig.firebase.apiKey;
            baseConfig.firebase_app_id = globalProviderConfig.firebase.appId;
            baseConfig.firebase_project_id = globalProviderConfig.firebase.projectId;
        } else if (app.db_provider_type === 'SOCKET_IO' && globalProviderConfig.socketio) {
            baseConfig.socketio_server_url = globalProviderConfig.socketio.serverUrl;
        }
        decryptedConfig = { ...baseConfig, ...decryptedConfig };
    }

    // Trigger GitHub Workflow
    const axios = require('axios');
    const workflowName = githubConfig.workflow || 'release.yml';
    const ref = githubConfig.ref || 'main';
    const url = `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/actions/workflows/${workflowName}/dispatches`;

    const inputs: any = {
        version: app.version,
        db_provider_type: app.db_provider_type,
        universal_realtime: String(app.universal_realtime || false),
    };

    if (app.db_provider_type === 'SUPABASE') {
        inputs.supabase_url = decryptedConfig.supabase_url || '';
        inputs.supabase_anon_key = decryptedConfig.supabase_anon_key || '';
    } else if (app.db_provider_type === 'FIREBASE') {
        inputs.firebase_database_url = decryptedConfig.firebase_database_url || '';
        inputs.firebase_api_key = decryptedConfig.firebase_api_key || '';
        inputs.firebase_app_id = decryptedConfig.firebase_app_id || '';
        inputs.firebase_project_id = decryptedConfig.firebase_project_id || '';
    } else if (app.db_provider_type === 'SOCKET_IO') {
        inputs.socketio_server_url = decryptedConfig.socketio_server_url || '';
    }

    await axios.post(url, { ref: ref, inputs: inputs }, {
        headers: {
            'Authorization': `Bearer ${githubConfig.pat}`,
            'Accept': 'application/vnd.github.v3+json',
            'X-GitHub-Api-Version': '2022-11-28'
        }
    });

    // Find GitHub Run ID
    let githubRunId: number | null = null;
    try {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const runsUrl = `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/actions/workflows/${workflowName}/runs?event=workflow_dispatch&per_page=5`;
        const runsRes = await axios.get(runsUrl, {
            headers: {
                'Authorization': `Bearer ${githubConfig.pat}`,
                'Accept': 'application/vnd.github.v3+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });

        if (runsRes.data?.workflow_runs) {
            const now = new Date().getTime();
            const candidate = runsRes.data.workflow_runs.find((r: any) => {
                const created = new Date(r.created_at).getTime();
                return (now - created) < 90000; // Increased window to 90s
            });
            if (candidate) githubRunId = candidate.id;
        }
    } catch (e) { }

    // Update DB
    if (githubRunId) {
        await prisma.$executeRaw`
            UPDATE app_builder_apps 
            SET build_status = 'building', 
                build_started_at = NOW(), 
                build_error = NULL, 
                build_completed_at = NULL, 
                github_run_id = ${githubRunId} 
            WHERE id = ${appId}::uuid
        `;
    } else {
        await prisma.app_builder_apps.update({
            where: { id: appId },
            data: {
                build_status: 'building',
                build_started_at: new Date(),
                build_error: null,
                build_completed_at: null
            }
        });
    }

    io.to('app-builder').emit('app_change', { eventType: 'UPDATE', new: { id: appId.toString(), build_status: 'building' } });
}

/**
 * POST /api/v1/app-builder/apps/:id/build
 * Trigger build
 */
router.post('/:id/build', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;

    // Ensure id is a string
    const appId = Array.isArray(id) ? id[0] : id;

    try {
        await triggerGitHubBuild(appId, userId);
        return res.json({ success: true, message: 'Build triggered successfully' });
    } catch (error: any) {
        logger.error('Build trigger error:', error);

        let errorMessage = error.message || 'Failed to trigger build';
        if (error.response?.status === 404) errorMessage = 'GitHub repository/workflow not found.';
        if (error.response?.status === 401) errorMessage = 'Invalid GitHub Token.';

        await supabase.from('app_builder_apps').update({ build_status: 'failed', build_error: errorMessage }).eq('id', appId);
        return res.status(500).json({ success: false, error: errorMessage });
    }
}));
router.delete('/:id/build', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;

    const { error } = await supabase
        .from('app_builder_apps')
        .update({ build_status: 'cancelled' })
        .eq('id', id)
        .eq('owner_id', userId);

    if (error) {
        logger.error('Build cancel error:', error);
        return res.status(500).json({ success: false, error: 'Failed to cancel build' });
    }

    // Emit real-time update
    io.to('app-builder').emit('app_change', { eventType: 'UPDATE', new: { id: id.toString(), build_status: 'cancelled' } });

    return res.json({ success: true });
}));

/**
 * GET /api/v1/app-builder/apps/:id/status
 * Get build status
 */
router.get('/:id/status', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;

    // Fetch App
    const { data: app, error } = await supabase
        .from('app_builder_apps')
        .select('id, build_status, github_run_id, build_started_at, build_completed_at, build_error')
        .eq('id', id)
        .eq('owner_id', userId)
        .single();

    if (error || !app) {
        return res.status(404).json({ success: false, error: 'App not found' });
    }

    // If active build, verify with GitHub
    if ((app.build_status === 'building' || app.build_status === 'queued') && app.github_run_id) {
        try {
            // Fetch GitHub config
            const settings = await prisma.user_settings.findUnique({
                where: { user_id: userId },
                select: { github_workflow_config: true }
            });

            const githubConfig = settings?.github_workflow_config as any;
            if (githubConfig && githubConfig.pat) {
                const axios = require('axios');
                const runUrl = `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/actions/runs/${app.github_run_id}`;

                const runRes = await axios.get(runUrl, {
                    headers: {
                        'Authorization': `Bearer ${githubConfig.pat}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });

                const run = runRes.data;
                const ghStatus = run.status; // queued, in_progress, completed
                const ghConclusion = run.conclusion; // success, failure, cancelled, etc.

                let newStatus = app.build_status;
                let newCompletedAt = app.build_completed_at;
                let newError = app.build_error;

                // Map GitHub status to App status
                if (ghStatus === 'completed') {
                    newCompletedAt = new Date().toISOString();
                    if (ghConclusion === 'success') {
                        newStatus = 'success';
                        // Construct release URL (assuming standard release asset if needed, or just the status)
                        // Actually, we might want to fetch the release URL if available
                    } else if (ghConclusion === 'cancelled') {
                        newStatus = 'failed'; // or cancelled if we supported it
                        newError = 'Build cancelled on GitHub';
                    } else {
                        newStatus = 'failed';
                        newError = `GitHub build failed: ${ghConclusion}`;
                    }
                } else if (ghStatus === 'in_progress') {
                    newStatus = 'building';
                } else if (ghStatus === 'queued') {
                    newStatus = 'queued';
                }

                // If status changed, update DB
                if (newStatus !== app.build_status) {
                    // Ensure id is a string
                    const appId = Array.isArray(id) ? id[0] : id;

                    const updatedApp = await prisma.app_builder_apps.update({
                        where: { id: appId },
                        data: {
                            build_status: newStatus,
                            build_completed_at: newCompletedAt ? new Date(newCompletedAt) : null,
                            build_error: newError
                        }
                    });

                    // Update local object for response
                    app.build_status = newStatus;
                    app.build_completed_at = newCompletedAt;
                    app.build_error = newError;

                    // Emit real-time update to all connected clients
                    io.to('app-builder').emit('app_change', {
                        eventType: 'UPDATE',
                        new: {
                            id: updatedApp.id,
                            build_status: updatedApp.build_status,
                            github_run_id: (updatedApp as any).github_run_id ? String((updatedApp as any).github_run_id) : null,
                            build_started_at: updatedApp.build_started_at?.toISOString() || null,
                            build_finished_at: updatedApp.build_completed_at?.toISOString() || null,
                            error_message: updatedApp.build_error
                        }
                    });
                }
            }
        } catch (ghError: any) {
            logger.warn(`Failed to sync GitHub status for app ${id}:`, ghError.message);
        }
    }

    return res.json({ success: true, status: app });
}));

/**
 * GET /api/v1/app-builder/apps/:id/config
 * Get app config
 */
router.get('/:id/config', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;

    const { data: app, error } = await supabase
        .from('app_builder_apps')
        .select('encrypted_config')
        .eq('id', id)
        .eq('owner_id', userId)
        .single();

    if (error || !app) {
        return res.status(404).json({ success: false, error: 'App not found' });
    }

    try {
        const decryptedConfig = encryptionService.decrypt(app.encrypted_config);
        return res.json({ success: true, config: decryptedConfig });
    } catch (error: any) {
        logger.error('Decryption error:', error.message);
        return res.status(500).json({ success: false, error: 'Failed to decrypt config' });
    }
}));

/**
 * PUT /api/v1/app-builder/apps/:id/config
 * Update app config
 */
router.put('/:id/config', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;
    const { config: newConfig } = req.body;

    if (!newConfig) {
        return res.status(400).json({ success: false, error: 'Config required' });
    }

    const encryptedConfig = encryptionService.encrypt(newConfig);

    const { error } = await supabase
        .from('app_builder_apps')
        .update({ encrypted_config: encryptedConfig })
        .eq('id', id)
        .eq('owner_id', userId);

    if (error) {
        logger.error('Config update error:', error);
        return res.status(500).json({ success: false, error: 'Failed to update config' });
    }

    return res.json({ success: true });
}));

/**
 * GET /api/v1/app-builder/apps/:id/logs
 * Get build logs
 */
router.get('/:id/logs', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;

    // Fetch App to get run ID
    const { data: app, error: appError } = await supabase
        .from('app_builder_apps')
        .select('github_run_id')
        .eq('id', id)
        .eq('owner_id', userId)
        .single();

    if (appError || !app) {
        return res.status(404).json({ success: false, error: 'App not found' });
    }

    if (!app.github_run_id) {
        return res.json({ success: true, logs: [] });
    }

    // Fetch GitHub config
    const settings = await prisma.user_settings.findUnique({
        where: { user_id: userId },
        select: { github_workflow_config: true }
    });

    const githubConfig = settings?.github_workflow_config as any;
    if (!githubConfig || !githubConfig.pat) {
        return res.status(400).json({ success: false, error: 'GitHub config missing' });
    }

    try {
        const axios = require('axios');
        const headers = {
            'Authorization': `Bearer ${githubConfig.pat}`,
            'Accept': 'application/vnd.github.v3+json',
            'X-GitHub-Api-Version': '2022-11-28'
        };

        // Get jobs for the run
        const jobsUrl = `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/actions/runs/${app.github_run_id}/jobs`;
        const jobsRes = await axios.get(jobsUrl, { headers });
        const jobs = jobsRes.data.jobs;

        if (!jobs || jobs.length === 0) {
            return res.json({ success: true, logs: [{ timestamp: new Date().toISOString(), level: 'info', message: 'Waiting for jobs to start...' }] });
        }

        // Get logs for the first job (usually "release" or "build")
        const job = jobs[0]; // Simplification: assume first job is main one

        // Fetch logs (text format)
        // Note: The download logs endpoint redirects to a raw text file or returns it.
        const logsUrl = `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/actions/jobs/${job.id}/logs`;
        const logsRes = await axios.get(logsUrl, { headers, responseType: 'text' });

        const rawLogs: string = logsRes.data;
        const parsedLogs = rawLogs.split('\n').map(line => {
            // Attempt to extract timestamp: "2024-01-30T10:00:00.1234567Z log message"
            const parts = line.indexOf(' ') > -1 ? [line.substring(0, line.indexOf(' ')), line.substring(line.indexOf(' ') + 1)] : [line];

            if (parts.length >= 2 && !isNaN(Date.parse(parts[0]))) {
                return {
                    timestamp: parts[0],
                    level: 'info',
                    message: parts[1]
                };
            }
            return {
                timestamp: new Date().toISOString(), // Fallback
                level: 'info',
                message: line
            };
        }).filter(l => l.message.trim() !== '');

        return res.json({ success: true, logs: parsedLogs });

    } catch (error: any) {
        logger.error('Error fetching logs:', error.message);
        // Don't fail the request, just return empty or error log
        return res.json({ success: true, logs: [{ timestamp: new Date().toISOString(), level: 'error', message: 'Failed to fetch logs from GitHub: ' + (error.response?.data?.message || error.message) }] });
    }
}));

/**
 * GET /api/v1/app-builder/apps/:id/download
 * Download built APK
 */
router.get('/:id/download', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;

    // Fetch App with version for fallback release check
    const { data: app, error } = await supabase
        .from('app_builder_apps')
        .select('apk_url, build_status, github_run_id, version')
        .eq('id', id)
        .eq('owner_id', userId)
        .single();

    if (error || !app) {
        return res.status(404).json({ success: false, error: 'App not found' });
    }

    // Return cached URL if available
    if (app.apk_url) {
        return res.json({ success: true, url: app.apk_url });
    }

    // Check GitHub if we have run ID or version
    if (app.github_run_id || app.version) {
        try {
            const settings = await prisma.user_settings.findUnique({
                where: { user_id: userId },
                select: { github_workflow_config: true }
            });

            const githubConfig = settings?.github_workflow_config as any;
            if (!githubConfig || !githubConfig.pat) {
                return res.status(400).json({ success: false, error: 'GitHub config missing' });
            }

            const axios = require('axios');
            const headers = {
                'Authorization': `Bearer ${githubConfig.pat}`,
                'Accept': 'application/vnd.github.v3+json'
            };

            let signedUrl = null;
            let debugInfo: string[] = [];

            // Helper to resolve signed URL
            const resolveSignedUrl = async (url: string, isJson = false) => {
                try {
                    const headers: any = {
                        'Authorization': `Bearer ${githubConfig.pat}`,
                        'X-GitHub-Api-Version': '2022-11-28'
                    };
                    if (!isJson) {
                        headers['Accept'] = 'application/octet-stream'; // For release assets
                    }

                    // Artifacts zip endpoint behaves slightly differently, usually just redirect

                    const res = await axios.get(url, {
                        headers,
                        maxRedirects: 0, // CRITICAL: Stop and capture the redirect
                        validateStatus: (status: number) => status >= 200 && status < 400 // Accept 302
                    });

                    return res.headers['location'];
                } catch (e: any) {
                    // Axios throws on 302 if maxRedirects is 0 depending on version, 
                    // or maybe we need to catch it.
                    // Actually axios often throws 'Max redirects exceeded' if handled strictly, 
                    // but with maxRedirects:0 and validateStatus allowing 302, we should get the response.
                    if (e.response && (e.response.status === 302 || e.response.status === 301)) {
                        return e.response.headers['location'];
                    }
                    console.error('Resolve URL failed:', e.message);
                    return null;
                }
            };

            // 1. Try Release Assets (Preferred: Direct APK)
            if (!signedUrl && app.version) {
                const tags = [app.version, `v${app.version}`];
                for (const tag of tags) {
                    try {
                        const releaseUrl = `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/releases/tags/${tag}`;
                        const releaseRes = await axios.get(releaseUrl, { headers });
                        const assets = releaseRes.data.assets || [];

                        if (assets.length > 0) debugInfo.push(`Release ${tag} Assets: ${assets.map((a: any) => a.name).join(', ')}`);

                        const apkAsset = assets.find((a: any) => a.name.toLowerCase().endsWith('.apk'));
                        if (apkAsset) {
                            // Release Asset API: /repos/{owner}/{repo}/releases/assets/{asset_id}
                            // Requires Accept: application/octet-stream to redirect to binary
                            const assetUrl = `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/releases/assets/${apkAsset.id}`;
                            signedUrl = await resolveSignedUrl(assetUrl, false);
                            break;
                        }
                    } catch (e: any) {
                        // Ignore 404s
                    }
                }
            }

            // 2. Try Run Artifacts (Fallback: Zip file)
            if (!signedUrl && app.github_run_id) {
                try {
                    const artifactsUrl = `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/actions/runs/${app.github_run_id}/artifacts`;
                    const artifactsRes = await axios.get(artifactsUrl, { headers });
                    const artifacts = artifactsRes.data.artifacts || [];

                    if (artifacts.length > 0) debugInfo.push(`Artifacts: ${artifacts.map((a: any) => a.name).join(', ')}`);

                    const apkArtifact = artifacts.find((a: any) => {
                        const n = a.name.toLowerCase();
                        return n.includes('apk') || n === 'release' || n === 'app-release' || n === 'app-debug' || n === 'app' || n === 'keepalive';
                    });

                    if (apkArtifact) {
                        // Artifact download endpoint: /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/zip
                        // This returns a 302 to the zip blob
                        const zipUrl = `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/actions/artifacts/${apkArtifact.id}/zip`;
                        signedUrl = await resolveSignedUrl(zipUrl, true); // Artifacts API doesn't need octet-stream header usually, just auth
                    }
                } catch (e: any) {
                    debugInfo.push(`Artifact check failed: ${e.message}`);
                }
            }

            if (signedUrl) {
                return res.json({ success: true, url: signedUrl });
            } else {
                return res.json({ success: false, error: `No APK found via Artifacts or Releases. Info: ${debugInfo.join(' | ') || 'None found'}` });
            }

        } catch (e: any) {
            logger.error('Failed to fetch download URL:', e.message);
            return res.status(500).json({ success: false, error: 'Failed to resolve download URL from GitHub' });
        }
    }

    return res.status(400).json({ success: false, error: 'APK not ready and no build information available' });
}));

export default router;
