import { Router, Request, Response } from 'express';
// import { createClient } from '@supabase/supabase-js'; // Removed
import prisma from '../../lib/prisma'; // Added
import { asyncHandler } from '../../middleware/errorHandler';
import { authenticate, requireRole } from '../../middleware/auth';
// import config from '../../config/env'; // Not needed for Prisma unless URL is manual
import logger from '../../utils/logger';

const router = Router();
// const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey); // Removed
// const prisma = new PrismaClient(); // Added

const adminOnly = [authenticate, requireRole(['admin'])];

router.get('/github-config', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const isAdmin = req.user!.role === 'admin';

    const config = await prisma.global_config.findUnique({
        where: { config_key: 'github_workflow_config' }
    });

    // Only admins get the PAT, others get null or masked
    const githubConfig = config?.config_value as any;
    if (githubConfig && !isAdmin) {
        delete githubConfig.pat;
    }

    return res.json({
        success: true,
        config: githubConfig || null,
        isAdmin
    });
}));

/**
 * GET /api/v1/app-builder/github/runs
 * List recent GitHub workflow runs
 */
router.get('/runs', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

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
        const runsUrl = `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/actions/workflows/${githubConfig.workflow}/runs?per_page=20`;
        const runsRes = await axios.get(runsUrl, {
            headers: {
                'Authorization': `Bearer ${githubConfig.pat}`,
                'Accept': 'application/vnd.github.v3+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });

        const runs = runsRes.data.workflow_runs.map((r: any) => ({
            id: r.id,
            name: r.name,
            status: r.status,
            conclusion: r.conclusion,
            created_at: r.created_at,
            updated_at: r.updated_at,
            url: r.html_url,
            head_branch: r.head_branch,
            run_started_at: r.run_started_at
        }));

        return res.json({ success: true, runs });
    } catch (error: any) {
        logger.error(error, 'GitHub runs fetch error');
        return res.status(500).json({ success: false, error: 'Failed to fetch GitHub runs' });
    }
}));

/**
 * POST /api/v1/app-builder/github/runs/:runId/cancel
 * Cancel a GitHub workflow run
 */
router.post('/runs/:runId/cancel', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { runId } = req.params;

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
        const cancelUrl = `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/actions/runs/${runId}/cancel`;
        await axios.post(cancelUrl, {}, {
            headers: {
                'Authorization': `Bearer ${githubConfig.pat}`,
                'Accept': 'application/vnd.github.v3+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });

        return res.json({ success: true });
    } catch (error: any) {
        logger.error(error, 'GitHub run cancel error');
        return res.status(500).json({ success: false, error: 'Failed to cancel GitHub run' });
    }
}));

/**
 * POST /api/v1/app-builder/github-config
 * Update GitHub workflow configuration
 */
router.post('/github-config', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { config: githubConfig } = req.body;

    if (!githubConfig) {
        return res.status(400).json({ success: false, error: 'Config required' });
    }

    try {
        await prisma.global_config.upsert({
            where: { config_key: 'github_workflow_config' },
            update: {
                config_value: githubConfig,
                updated_by: BigInt(userId), // Assuming BigInt ID mapping
                updated_at: new Date()
            },
            create: {
                config_key: 'github_workflow_config',
                config_value: githubConfig,
                updated_by: BigInt(userId)
            }
        });

        return res.json({ success: true });
    } catch (error: any) {
        logger.error(error, 'GitHub config update error');
        return res.status(500).json({ success: false, error: 'Failed to update config' });
    }
}));

/**
 * DELETE /api/v1/app-builder/github-config
 * Delete GitHub workflow configuration
 */
router.delete('/github-config', ...adminOnly, asyncHandler(async (_req: Request, res: Response) => {
    try {
        await prisma.global_config.delete({
            where: { config_key: 'github_workflow_config' }
        });

        return res.json({ success: true });
    } catch (error: any) {
        // If record doesn't exist, that's fine for delete
        if (error.code === 'P2025') {
            return res.json({ success: true });
        }
        logger.error(error, 'GitHub config delete error');
        return res.status(500).json({ success: false, error: 'Failed to delete config' });
    }
}));

export default router;
