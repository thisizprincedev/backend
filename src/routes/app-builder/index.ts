import { Router } from 'express';
import appsRoutes from './apps';
import providersRoutes from './providers';
import githubRoutes from './github';

const router = Router();

// Mount sub-routes
router.use('/apps', appsRoutes);
router.use('/providers', providersRoutes);

// Mount GitHub config routes at root level
router.use('/', githubRoutes);

// Also mount firebase config at root level for backward compatibility
router.use('/firebase', providersRoutes);

export default router;
