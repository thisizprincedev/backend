import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { firebaseService } from '../../services/firebase.service';
import logger from '../../utils/logger';

const router = Router();

/**
 * POST /api/v1/firebase/proxy
 * Proxy Firebase Realtime Database operations
 */
router.post('/proxy', asyncHandler(async (req: Request, res: Response) => {
    const { action, path, config, data } = req.body;

    // Validate request
    if (!action || !path || !config?.databaseURL) {
        return res.status(400).json({
            error: 'Missing required fields: action, path, config.databaseURL'
        });
    }

    if (!['read', 'write', 'delete'].includes(action)) {
        return res.status(400).json({
            error: 'Invalid action. Must be: read, write, or delete'
        });
    }

    logger.info(`Firebase proxy: ${action} on ${path}`);

    try {
        const result = await firebaseService.proxy(
            action as 'read' | 'write' | 'delete',
            config.databaseURL,
            path,
            data
        );

        // Check if service returned an error (e.g., permission denied)
        if (result?.error) {
            return res.json({
                success: false,
                error: result.error,
                useClientAuth: result.useClientAuth || false
            });
        }

        return res.json({
            success: true,
            data: result
        });
    } catch (error: any) {
        logger.error('Firebase proxy error:', error.message);
        return res.status(500).json({
            error: error.message || 'Firebase operation failed'
        });
    }
}));

export default router;
