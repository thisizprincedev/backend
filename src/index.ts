import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';

import config from './config/env';
import logger from './utils/logger';
import apiRoutes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { initSocket } from './socket';
import { metricsMiddleware, metricsEndpoint } from './middleware/metrics.middleware';

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
    logger.error('CRITICAL: Uncaught Exception', {
        error: error.message,
        stack: error.stack,
        fatal: true
    });
    // Give some time for logs to be flushed before exiting
    setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason) => {
    logger.error('CRITICAL: Unhandled Rejection', {
        reason: reason instanceof Error ? reason.message : reason,
        stack: reason instanceof Error ? reason.stack : undefined,
        fatal: true
    });
});

// Initialize Backend Realtime Registry
import { realtimeRegistry } from './services/realtimeRegistry';
import { mqttBridge } from './services/MqttBridge';
import { natsService } from './services/NatsService';

const app: Application = express();
const httpServer = createServer(app);

// Initialize Socket.IO
const io = initSocket(httpServer);

// Trust proxy for rate limiting behind load balancers
app.set('trust proxy', 1);

// 🛡️ Guard first, then Bridge
(async () => {
    try {
        await natsService.init();
        await realtimeRegistry.init();
        mqttBridge.init();
    } catch (err) {
        logger.error(err, 'Service initialization failed');
    }
})();

// Middleware
app.use(metricsMiddleware);
app.use(helmet());
app.use(cors({
    origin: config.cors.origin,
    credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Prometheus metrics endpoint (Internal/Admin only usually, but exposing for now)
app.get('/metrics', metricsEndpoint);

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.env,
    });
});

// Rate Limiting for Device Registration (Anti-spam)
const registrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Limit each IP to 10 registrations per hour
    message: { error: 'Too many registration attempts from this IP, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    // Skip rate limiting if it's an authenticated admin
    skip: (req) => req.headers.authorization !== undefined
});

// Logging (using morgan to bridge to Winston)
app.use(morgan('combined', {
    stream: {
        write: (message: string) => logger.info(message.trim(), { type: 'http' }),
    },
}));

// API routes
app.use(`/api/${config.apiVersion}/mobile/devices`, registrationLimiter);
app.use(`/api/${config.apiVersion}`, apiRoutes);

// Crash test endpoint (Remove in production)
if (config.env === 'development') {
    app.get('/debug/crash', () => {
        throw new Error('Debug: Simulated system crash');
    });
}

// 404 handler
app.use((req: Request, res: Response) => {
    res.status(404).json({
        error: 'Not Found',
        path: req.path,
    });
});

// Error handler
app.use(errorHandler);

// Start server
const PORT = config.port;

const startServer = async () => {
    try {
        // Initialize Monitoring Service (loads settings from DB)
        const { monitoringService } = await import('./services/monitoring.service');
        await monitoringService.init();

        httpServer.listen(PORT, () => {
            logger.info(`🚀 Server running on port ${PORT}`);
            logger.info(`📡 Environment: ${config.env}`);
            logger.info(`🔗 API: http://localhost:${PORT}/api/${config.apiVersion}`);
            logger.info(`💚 Health: http://localhost:${PORT}/health`);
        });
    } catch (err) {
        logger.error(err, 'Failed to start server');
        process.exit(1);
    }
};

if (process.env.SKIP_SERVER_START !== 'true') {
    startServer();
}

// Graceful shutdown
const shutdown = async (signal: string) => {
    logger.info(`${signal} signal received: closing server`);

    httpServer.close(async () => {
        logger.info('HTTP server closed');

        try {
            mqttBridge.shutdown();
            realtimeRegistry.shutdown();
            await natsService.close();

            logger.info('All services shut down. Exiting.');
            process.exit(0);
        } catch (err) {
            logger.error(err, 'Error during shutdown');
            process.exit(1);
        }
    });

    setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app, io };
