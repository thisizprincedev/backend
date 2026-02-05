import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import config from './config/env';
import logger from './utils/logger';
import redis from './lib/redis';
import { logRelay, LOG_EVENT } from './utils/logRelay';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

let io: SocketIOServer | null = null;

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

export const initSocket = (httpServer: HttpServer): SocketIOServer => {
    if (io) {
        return io;
    }

    const pubClient = redis;
    const subClient = pubClient.duplicate();

    subClient.on('error', (err) => {
        logger.error(err, 'Redis subClient error:');
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

    // Socket auth middleware
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.headers['authorization']?.split(' ')[1];
            if (!token) return next();

            const decoded = jwt.verify(token, config.jwt.secret) as any;

            // Fetch user role from profile
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('id', decoded.id)
                .single();

            if (profile) {
                (socket.request as any).user = profile;
            }
            next();
        } catch (err) {
            logger.warn({ err }, 'Socket auth error');
            next();
        }
    });

    // Listen to log relay and broadcast to admin_logs room
    logRelay.on(LOG_EVENT, (log) => {
        if (io) {
            io.to('admin_logs').emit(LOG_EVENT, log);
        }
    });

    io.on('connection', (socket: Socket) => {
        const user = (socket.request as any).user;
        logger.info(`[Socket] Client connected: ${socket.id} (User: ${user?.email || 'unknown'})`);

        // Join room for specific updates
        socket.on('join', (room: string) => {
            if (!room) return;

            // Security: Only admins can join admin_logs
            if (room === 'admin_logs') {
                if (user?.role !== 'admin') {
                    logger.warn({ socketId: socket.id, userId: user?.id }, 'Non-admin attempted to join admin_logs');
                    socket.emit('error', { message: 'Unauthorized to join this room' });
                    return;
                }
            }

            socket.join(room);
            logger.info(`[Socket] ${socket.id} joined room: "${room}"`);
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
