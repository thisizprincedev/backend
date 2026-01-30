import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import config from './config/env';
import logger from './utils/logger';

let io: SocketIOServer | null = null;

export const initSocket = (httpServer: HttpServer): SocketIOServer => {
    if (io) {
        return io;
    }

    io = new SocketIOServer(httpServer, {
        cors: {
            origin: config.socket.corsOrigin,
            methods: ['GET', 'POST'],
            credentials: true,
        },
    });

    io.on('connection', (socket) => {
        logger.info(`Socket connected: ${socket.id}`);

        // Join room for specific updates
        socket.on('join', (room: string) => {
            socket.join(room);
            logger.info(`Socket ${socket.id} joined room: ${room}`);
        });

        // Leave room
        socket.on('leave', (room: string) => {
            socket.leave(room);
            logger.info(`Socket ${socket.id} left room: ${room}`);
        });

        socket.on('disconnect', () => {
            logger.info(`Socket disconnected: ${socket.id}`);
        });
    });

    // Initialize services that need Socket.IO
    import('./services/cloudPhoneManager').then(({ cloudPhoneManager }) => {
        cloudPhoneManager.setIo(io!);
    });

    return io;
};

export const getIo = (): SocketIOServer => {
    if (!io) {
        throw new Error('Socket.IO not initialized!');
    }
    return io;
};
