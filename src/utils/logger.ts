import pino from 'pino';
import config from '../config/env';
import { logRelay, LOG_EVENT } from './logRelay';

const isDevelopment = config.env === 'development';

// Custom stream to relay logs to logRelay (for Socket.IO streaming)
const relayStream = {
    write: (log: string) => {
        try {
            const parsedLog = JSON.parse(log);
            logRelay.emit(LOG_EVENT, parsedLog);
        } catch (e) {
            // Ignore parse errors (e.g. if log is already an object or raw string)
        }
    }
};

const logger = pino(
    {
        level: isDevelopment ? 'debug' : 'info',
    },
    pino.multistream([
        {
            stream: isDevelopment
                ? pino.transport({
                    target: 'pino-pretty',
                    options: {
                        ignore: 'pid,hostname',
                        translateTime: 'HH:MM:ss Z',
                        colorize: true,
                    },
                })
                : process.stdout
        },
        { stream: relayStream }
    ])
);

// Helper for HTTP logging to match previous implementation
export const httpLogger = (message: string) => {
    logger.info({ msg: message.trim() }, 'HTTP');
};

export default logger;
