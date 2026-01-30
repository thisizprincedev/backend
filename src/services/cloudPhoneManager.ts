import { Server } from 'socket.io';
import { geelarkService } from './geelark.service';
import logger from '../utils/logger';

export class CloudPhoneManager {
    private io: Server | null = null;
    private phoneStates: Map<string, any> = new Map();

    setIo(io: Server) {
        this.io = io;
    }

    /**
     * Start a cloud phone and emit real-time status
     */
    async startPhone(apiKey: string, phoneId: string) {
        this.emitStatus(phoneId, 'starting', 10);

        try {
            const result = await geelarkService.startPhone(apiKey, phoneId);

            if (result.code === 0) {
                this.emitStatus(phoneId, 'running', 100);
            } else {
                this.emitStatus(phoneId, 'error', 0, result.msg || 'Start failed');
            }

            return result;
        } catch (error: any) {
            this.emitStatus(phoneId, 'error', 0, error.message);
            throw error;
        }
    }

    /**
     * Control phone with real-time updates
     */
    async controlPhone(apiKey: string, phoneId: string, action: string) {
        this.emitStatus(phoneId, action + 'ing', 30);

        try {
            const result = await geelarkService.controlPhone(apiKey, phoneId, action);

            if (result.code === 0) {
                const status = action === 'stop' ? 'stopped' : 'restarted';
                this.emitStatus(phoneId, status, 100);
            } else {
                this.emitStatus(phoneId, 'error', 0, result.msg || `${action} failed`);
            }

            return result;
        } catch (error: any) {
            this.emitStatus(phoneId, 'error', 0, error.message);
            throw error;
        }
    }

    private emitStatus(phoneId: string, status: string, progress: number, error?: string) {
        if (!this.io) return;

        const state = { phoneId, status, progress, error, timestamp: new Date() };
        this.phoneStates.set(phoneId, state);

        this.io.to(`cloud-phone-${phoneId}`).emit('phone_status', state);
        this.io.to('cloud-phones-admin').emit('phone_status_update', state);

        logger.debug(`Phone ${phoneId} status: ${status} (${progress}%)`);
    }

    getPhoneState(phoneId: string) {
        return this.phoneStates.get(phoneId);
    }
}

export const cloudPhoneManager = new CloudPhoneManager();
