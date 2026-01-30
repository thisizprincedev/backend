import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';

import config from './config/env';
import logger from './utils/logger';
import apiRoutes from './routes';
import { errorHandler } from './middleware/errorHandler';

const app: Application = express();
const httpServer = createServer(app);

// Socket.IO setup
// Socket.IO setup
import { initSocket } from './socket';

const io = initSocket(httpServer);

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
        write: (message: string) => logger.http(message.trim()),
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

// Socket.IO connection handling
// Socket.IO connection handling moved to socket.ts

// Start server
const PORT = config.port;

httpServer.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT}`);
    logger.info(`📡 Environment: ${config.env}`);
    logger.info(`🔗 API: http://localhost:${PORT}/api/${config.apiVersion}`);
    logger.info(`💚 Health: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received: closing HTTP server');
    httpServer.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });
});

export { app, io };
