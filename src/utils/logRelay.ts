import { EventEmitter } from 'events';

/**
 * Global Event Emitter for system logs.
 * Used to relay logs from Pino to Socket.IO without circular dependencies.
 */
class LogEmitter extends EventEmitter { }

export const logRelay = new LogEmitter();

// Constants for events
export const LOG_EVENT = 'system_log';
