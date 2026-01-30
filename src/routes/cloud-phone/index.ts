import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { geelarkService } from '../../services/geelark.service';
import { authenticate, requireRole } from '../../middleware/auth';
import webhookRoutes from './webhooks';
import profilesRoutes from './profiles';
import dataRoutes from './data';
import { cloudPhoneManager } from '../../services/cloudPhoneManager';

const router = Router();

// Mount sub-routes
router.use('/webhooks', webhookRoutes);
router.use('/profiles', authenticate, requireRole(['admin']), profilesRoutes);
router.use('/data', authenticate, requireRole(['admin']), dataRoutes);

const adminOnly = [authenticate, requireRole(['admin'])];

/**
 * GET /api/v1/cloud-phones
 * List cloud phones
 */
router.get('/', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { apiKey, page, pageSize, ids, serialName, remark, groupName, tags, chargeMode, openStatus } = req.query;

    if (!apiKey) {
        return res.status(400).json({ error: 'API key required' });
    }

    const params: any = {
        page: page ? parseInt(page as string) : 1,
        pageSize: pageSize ? parseInt(pageSize as string) : 100,
    };

    if (ids) params.ids = Array.isArray(ids) ? ids : [ids];
    if (serialName) params.serialName = serialName;
    if (remark) params.remark = remark;
    if (groupName) params.groupName = groupName;
    if (tags) params.tags = Array.isArray(tags) ? tags : [tags];
    if (chargeMode) params.chargeMode = parseInt(chargeMode as string);
    if (openStatus) params.openStatus = parseInt(openStatus as string);

    const result = await geelarkService.listPhones(apiKey as string, params);
    return res.json(result);
}));

/**
 * POST /api/v1/cloud-phones
 * Create cloud phone
 */
router.post('/', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { apiKey, ...params } = req.body;

    if (!apiKey) {
        return res.status(400).json({ error: 'API key required' });
    }

    const result = await geelarkService.createPhone(apiKey as string, params);
    return res.json(result);
}));

/**
 * DELETE /api/v1/cloud-phones/:id
 * Delete cloud phone
 */
router.delete('/:id', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { apiKey } = req.body;

    if (!apiKey) {
        return res.status(400).json({ error: 'API key required' });
    }

    const result = await geelarkService.deletePhone((apiKey as any) as string, id as string);
    return res.json(result);
}));

/**
 * POST /api/v1/cloud-phones/:id/start
 * Start cloud phone
 */
router.post('/:id/start', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { apiKey } = req.body;

    if (!apiKey) {
        return res.status(400).json({ error: 'API key required' });
    }

    const result = await cloudPhoneManager.startPhone((apiKey as any) as string, id as string);
    return res.json(result);
}));

/**
 * POST /api/v1/cloud-phones/:id/control
 * Control cloud phone (restart, stop, etc.)
 */
router.post('/:id/control', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { apiKey, action } = req.body;

    if (!apiKey || !action) {
        return res.status(400).json({ error: 'API key and action required' });
    }

    const result = await cloudPhoneManager.controlPhone(apiKey as string, id as string, action as string);
    return res.json(result);
}));

/**
 * GET /api/v1/cloud-phones/:id/status
 * Get cloud phone status
 */
router.get('/:id/status', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { apiKey } = req.query;

    if (!apiKey) {
        return res.status(400).json({ error: 'API key required' });
    }

    const result = await geelarkService.getPhoneStatus(apiKey as string, id as string);
    return res.json(result);
}));

/**
 * POST /api/v1/cloud-phones/:id/screenshot
 * Take screenshot
 */
router.post('/:id/screenshot', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { apiKey, action, taskId } = req.body;

    if (!apiKey) {
        return res.status(400).json({ error: 'API key required' });
    }

    const result = await geelarkService.screenshot(apiKey as string, id as string, action as string, taskId as string);
    return res.json(result);
}));

/**
 * GET /api/v1/cloud-phones/:id/apps
 * Get installed apps
 */
router.get('/:id/apps', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { apiKey } = req.query;

    if (!apiKey) {
        return res.status(400).json({ error: 'API key required' });
    }

    const result = await geelarkService.getPhoneApps(apiKey as string, id as string);
    return res.json(result);
}));

/**
 * POST /api/v1/cloud-phones/:id/apps/download
 * Download app to phone
 */
router.post('/:id/apps/download', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { apiKey, appUrl } = req.body;

    if (!apiKey || !appUrl) {
        return res.status(400).json({ error: 'API key and appUrl required' });
    }

    const result = await geelarkService.downloadApp(apiKey as string, id as string, appUrl as string);
    return res.json(result);
}));

/**
 * POST /api/v1/cloud-phones/:id/google-login
 * Google login automation
 */
router.post('/:id/google-login', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { apiKey, email, password } = req.body;

    if (!apiKey || !email || !password) {
        return res.status(400).json({ error: 'API key, email, and password required' });
    }

    const result = await geelarkService.googleLogin(apiKey as string, id as string, email as string, password as string);
    return res.json(result);
}));

/**
 * PATCH /api/v1/cloud-phones/:id
 * Update phone settings
 */
router.patch('/:id', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { apiKey, ...settings } = req.body;

    if (!apiKey) {
        return res.status(400).json({ error: 'API key required' });
    }

    const result = await geelarkService.updatePhone(apiKey as string, id as string, settings);
    return res.json(result);
}));

/**
 * GET /api/v1/cloud-phones/brands
 * List phone brands
 */
router.get('/brands', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { apiKey } = req.query;

    if (!apiKey) {
        return res.status(400).json({ error: 'API key required' });
    }

    const result = await geelarkService.listBrands(apiKey as string);
    return res.json(result);
}));

/**
 * GET /api/v1/cloud-phones/groups
 * List phone groups
 */
router.get('/groups', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { apiKey } = req.query;

    if (!apiKey) {
        return res.status(400).json({ error: 'API key required' });
    }

    const result = await geelarkService.listGroups(apiKey as string);
    return res.json(result);
}));

/**
 * GET /api/v1/cloud-phones/tasks
 * List async tasks
 */
router.get('/tasks', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { apiKey, ...params } = req.query;

    if (!apiKey) {
        return res.status(400).json({ error: 'API key required' });
    }

    const result = await geelarkService.listTasks(apiKey as string, params);
    return res.json(result);
}));

export default router;
