import { Router } from 'express';
import logger from '../../utils/logger';

const router = Router();

// POST /api/v1/monitoring/logging/client
router.post('/client', (req, res) => {
    const { level, message, meta } = req.body;

    const logMeta = {
        ...meta,
        source: meta?.source || req.body.source || 'frontend',
        userAgent: req.headers['user-agent'],
        ip: req.ip
    };

    switch (level) {
        case 'error':
            logger.error(message, logMeta);
            break;
        case 'warn':
            logger.warn(message, logMeta);
            break;
        case 'debug':
            logger.debug(message, logMeta);
            break;
        default:
            logger.info(message, logMeta);
            break;
    }

    res.status(204).end();
});

export default router;
