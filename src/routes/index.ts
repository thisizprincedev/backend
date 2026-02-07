import { Router } from 'express';
import config from '../config/env';
import cloudPhoneRoutes from './cloud-phone';
import auth2FARoutes from './auth/2fa';
import authRoutes from './auth';
import appBuilderRoutes from './app-builder';
import utilsRoutes from './utils';
import externalRoutes from './external';
import usersRoutes from './users';
import deviceCommandsRoutes from './device-commands';
import settingsRoutes from './settings';
import transactionsRoutes from './transactions';
import loginRecordsRoutes from './login-records';
import proxyRoutes from './proxy';
import mobileRoutes from './mobile';
import deviceRoutes from './devices';
import monitoringRoutes from './monitoring';

import { apiLimiter } from '../middleware/rateLimiter';

const router = Router();

// Global API Limiter
router.use(apiLimiter);

// Mount routes
router.use('/cloud-phones', cloudPhoneRoutes);
router.use('/auth/2fa', auth2FARoutes);
router.use('/auth', authRoutes);
router.use('/app-builder', appBuilderRoutes);
router.use('/notifications', utilsRoutes);
router.use('/users', usersRoutes);
router.use('/device-commands', deviceCommandsRoutes);
router.use('/settings', settingsRoutes);
router.use('/transactions', transactionsRoutes);
router.use('/login-records', loginRecordsRoutes);
router.use('/audit', utilsRoutes);
router.use('/proxy', proxyRoutes);
router.use('/external', externalRoutes);
router.use('/mobile', mobileRoutes);
router.use('/devices', deviceRoutes);
router.use('/monitoring', monitoringRoutes);

// API info endpoint
router.get('/', (_req, res) => {
    res.json({
        message: 'SRM Panel API',
        version: config.apiVersion,
        timestamp: new Date().toISOString(),
        endpoints: {
            cloudPhones: '/cloud-phones/*',
            auth: '/auth/*',
            auth2FA: '/auth/2fa/*',
            appBuilder: '/app-builder/*',
            external: '/external/*',
            notifications: '/notifications/telegram',
            users: '/users/*',
            deviceCommands: '/device-commands/*',
            settings: '/settings/global/*',
            transactions: '/transactions/analysis/*',
            loginRecords: '/login-records/*',
            audit: '/audit/log',
            proxy: '/proxy/lookup',
            devices: '/devices/*',
            monitoring: '/monitoring/*',
        },
        stats: {
            totalEndpoints: 60,
            edgeFunctionsReplaced: 80,
            supabaseDependency: 'Backend only'
        }
    });
});

export default router;
