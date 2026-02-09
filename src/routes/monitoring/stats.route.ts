import { Router } from 'express';
import { monitoringService } from '../../services/monitoring.service';
import logger from '../../utils/logger';

const router = Router();

// GET /api/v1/monitoring/health
router.get('/health', async (_req, res) => {
    try {
        const health = await monitoringService.getHealth();
        res.json(health);
    } catch (error) {
        logger.error('Failed to get system health', { error });
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/v1/monitoring/stats
router.get('/stats', async (_req, res) => {
    try {
        const stats = await monitoringService.getStats();
        res.json(stats);
    } catch (error) {
        logger.error('Failed to get system stats', { error });
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/logs', (_req, res) => {
    res.json(monitoringService.getLogs());
});

export default router;
