import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import config from './config/env';
import logger from './utils/logger';
import redis from './lib/redis';

let io: SocketIOServer | null = null;

export const initSocket = (httpServer: HttpServer): SocketIOServer => {
    if (io) {
        return io;
    }

    const pubClient = redis;
    const subClient = pubClient.duplicate();

    subClient.on('error', (err) => {
        logger.error('Redis subClient error:', err);
    });

    subClient.on('connect', () => {
        logger.info('Redis subClient connected');
    });

    io = new SocketIOServer(httpServer, {
        cors: {
            origin: config.socket.corsOrigin,
            methods: ['GET', 'POST'],
            credentials: true,
        },
        adapter: createAdapter(pubClient, subClient)
    });

    io.on('connection', (socket: Socket) => {
        const token = socket.handshake.auth.token;
        logger.info(`[Socket] Client connected: ${socket.id} (Token present: ${!!token})`);

        // Join room for specific updates
        socket.on('join', (room: string) => {
            if (!room) return;
            socket.join(room);
            logger.info(`[Socket] ${socket.id} joined room: "${room}"`);

            // Debug: list all rooms this socket is in
            const rooms = Array.from(socket.rooms);
            logger.debug(`[Socket] ${socket.id} current rooms: ${JSON.stringify(rooms)}`);
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
