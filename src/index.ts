import './utils/tracer'; // Must be first
import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';

import config from './config/env';
import logger, { httpLogger } from './utils/logger';
import apiRoutes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { initSocket } from './socket';

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
app.use(helmet());
app.use(cors({
    origin: config.cors.origin,
    credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('combined', {
    stream: {
        write: (message: string) => httpLogger(message.trim()),
    },
}));

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.env,
    });
});

// API routes
app.use(`/api/${config.apiVersion}`, apiRoutes);

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

startServer();

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
