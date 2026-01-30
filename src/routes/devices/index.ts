import { Router } from 'express';
import managementRoutes from './management';
import dataRoutes from './data';
import cloudRoutes from './cloud';
import messageRoutes from './messages';
import commandRoutes from '../device-commands';

const router = Router();

// Root level device routes
// Specific sub-routes first to avoid being caught by /:deviceId
router.use('/data', dataRoutes);
router.use('/cloud', cloudRoutes);
router.use('/cloud-messages', messageRoutes);
router.use('/commands', commandRoutes);

// General management routes (contains /:deviceId catch-all) last
router.use('/', managementRoutes);

export default router;
