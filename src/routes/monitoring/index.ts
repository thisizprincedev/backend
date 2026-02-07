import { Router } from 'express';
import statsRoutes from './stats.route';
import loggingRoutes from './logging.route';

const router = Router();

router.use('/', statsRoutes);
router.use('/logging', loggingRoutes);

export default router;
