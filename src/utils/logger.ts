import winston from 'winston';
import Transport from 'winston-transport';
import util from 'util';
import config from '../config/env';

const { level, consoleLevel } = config.logging;

// Safe JSON stringifier that handles circular references
// Safe JSON stringifier that handles circular references and huge objects
const safeStringify = (obj: any): string => {
    try {
        const seen = new WeakSet();
        return JSON.stringify(obj, (key, value) => {
            if (typeof value === 'object' && value !== null) {
                // Circular check
                if (seen.has(value)) return '[Circular]';
                seen.add(value);

                // Skip heavy axios/network internals by key
                if (['request', 'response', 'config', 'res', 'req', 'socket', '_header', 'client', 'agent'].includes(key)) {
                    return '[Truncated]';
                }

                // Skip by constructor name to catch instances even if keys don't match
                const constructorName = value.constructor?.name;
                if (['ClientRequest', 'IncomingMessage', 'Socket', 'Agent', 'TLSSocket'].includes(constructorName)) {
                    return `[${constructorName}]`;
                }
            }
            if (typeof value === 'bigint') return value.toString();
            return value;
        });
    } catch (err) {
        // Ultimate fallback if JSON.stringify still fails
        return util.inspect(obj, { depth: 2, compact: true, breakLength: Infinity });
    }
};

// Standard formatting for all transports (Safe JSON)
const standardFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf((info) => {
        const { timestamp, level, message, ...meta } = info;
        return safeStringify({ timestamp, level, message, ...meta });
    })
);

// Console formatting (prettier for dev)
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length
            ? util.inspect(meta, { depth: 2, colors: true, compact: true, breakLength: 120 })
            : '';
        return `[${timestamp}] ${level}: ${message} ${metaStr}`;
    })
);

// In-memory log buffer for live monitoring (last 100 logs)
const logBuffer: any[] = [];
const MAX_BUFFER_SIZE = 100;

// Custom transport for live stream buffer
class LiveBufferTransport extends Transport {
    constructor(opts?: any) {
        super(opts);
    }

    log(info: any, callback: () => void) {
        // Deep clone and clean to avoid circular references in buffer
        const cleanInfo = (obj: any, depth = 0): any => {
            if (depth > 3 || obj === null || typeof obj !== 'object') return obj;
            if (Array.isArray(obj)) return obj.map(item => cleanInfo(item, depth + 1));

            const cleaned: any = {};
            for (const key in obj) {
                if (key === 'request' || key === 'response' || key === 'config') continue; // Skip huge axios internals
                try {
                    const val = obj[key];
                    if (typeof val === 'object' && val !== null) {
                        cleaned[key] = '[Object]'; // Truncate deep objects for buffer
                    } else {
                        cleaned[key] = val;
                    }
                } catch (e) {
                    cleaned[key] = '[Unreadable]';
                }
            }
            return cleaned;
        };

        const logEntry = {
            timestamp: info.timestamp || new Date().toISOString(),
            level: info.level,
            message: info.message,
            ...cleanInfo(info)
        };

        // Remove complex winston internals
        delete (logEntry as any)[Symbol.for('message')];
        delete (logEntry as any)[Symbol.for('level')];
        delete (logEntry as any)[Symbol.for('splat')];

        logBuffer.unshift(logEntry);
        if (logBuffer.length > MAX_BUFFER_SIZE) {
            logBuffer.pop();
        }

        callback();
    }
}

const transports: winston.transport[] = [
    new winston.transports.Console({
        level: consoleLevel,
        format: config.env === 'development' ? consoleFormat : standardFormat,
    }),
    new LiveBufferTransport()
];

const loggerVisible = winston.createLogger({
    level: level,
    format: standardFormat,
    transports: transports,
    // Don't exit on handled exceptions
    exitOnError: false,
});

// Backward compatibility wrapper for the existing API
const loggerWrapper = {
    level: loggerVisible.level,
    info: (msgOrObj: any, meta?: any) => {
        if (typeof msgOrObj === 'string') {
            loggerVisible.info(msgOrObj, meta);
        } else {
            loggerVisible.info(meta || msgOrObj.msg || 'Log event', msgOrObj);
        }
    },
    error: (msgOrObj: any, meta?: any) => {
        if (typeof msgOrObj === 'string') {
            loggerVisible.error(msgOrObj, meta);
        } else {
            loggerVisible.error(meta || msgOrObj.msg || 'Error event', msgOrObj);
        }
    },
    warn: (msgOrObj: any, meta?: any) => {
        if (typeof msgOrObj === 'string') {
            loggerVisible.warn(msgOrObj, meta);
        } else {
            loggerVisible.warn(meta || msgOrObj.msg || 'Warning event', msgOrObj);
        }
    },
    debug: (msgOrObj: any, meta?: any) => {
        if (typeof msgOrObj === 'string') {
            loggerVisible.debug(msgOrObj, meta);
        } else {
            loggerVisible.debug(meta || msgOrObj.msg || 'Debug event', msgOrObj);
        }
    },
    getRecentLogs: () => [...logBuffer]
};

// Helper for HTTP logging
export const httpLogger = (message: string) => {
    loggerVisible.info(message.trim(), { type: 'http' });
};

export default loggerWrapper;
