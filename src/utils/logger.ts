import winston from 'winston';
import Transport from 'winston-transport';
import { ElasticsearchTransport } from 'winston-elasticsearch';
import config from '../config/env';

const { level, consoleLevel, elasticsearch } = config.logging;

// Standard formatting for all transports
const standardFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
);

// Console formatting (prettier for dev)
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        return `[${timestamp}] ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
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
        const logEntry = {
            timestamp: info.timestamp || new Date().toISOString(),
            level: info.level,
            message: info.message,
            ...info
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

// Add Elasticsearch transport if enabled
if (elasticsearch.enabled) {
    try {
        const esTransport = new ElasticsearchTransport({
            level: level,
            indexPrefix: elasticsearch.indexPrefix,
            clientOpts: {
                node: elasticsearch.node,
                auth: elasticsearch.username && elasticsearch.password ? {
                    username: elasticsearch.username,
                    password: elasticsearch.password,
                } : undefined
            },
            // Reduce payload size
            transformer: (logData) => {
                const { level, message, timestamp, ...meta } = logData;
                return {
                    '@timestamp': timestamp,
                    severity: level,
                    message,
                    fields: meta
                };
            }
        });

        esTransport.on('error', (error) => {
            console.error('Elasticsearch transport error:', error);
        });

        transports.push(esTransport);
    } catch (err) {
        console.error('Failed to initialize Elasticsearch transport:', err);
    }
}

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
