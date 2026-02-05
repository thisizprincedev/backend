import redis from '../lib/redis';
import logger from '../utils/logger';

export class PresenceService {
    private static readonly PRESENCE_KEY_PREFIX = 'presence:';
    private static readonly EXPIRY_SECONDS = 300; // 5 minutes

    /**
     * Mark a device as online
     */
    async markOnline(deviceId: string): Promise<void> {
        try {
            const key = `${PresenceService.PRESENCE_KEY_PREFIX}${deviceId}`;
            await redis.set(key, '1', 'EX', PresenceService.EXPIRY_SECONDS);
        } catch (err) {
            logger.error(`[PresenceService] Failed to mark device ${deviceId} online:`, err);
        }
    }

    /**
     * Mark a device as offline
     */
    async markOffline(deviceId: string): Promise<void> {
        try {
            const key = `${PresenceService.PRESENCE_KEY_PREFIX}${deviceId}`;
            await redis.del(key);
        } catch (err) {
            logger.error(`[PresenceService] Failed to mark device ${deviceId} offline:`, err);
        }
    }

    /**
     * Check if a device is online
     */
    async isOnline(deviceId: string): Promise<boolean> {
        try {
            const key = `${PresenceService.PRESENCE_KEY_PREFIX}${deviceId}`;
            const exists = await redis.exists(key);
            return exists === 1;
        } catch (err) {
            logger.error(`[PresenceService] Failed to check status for ${deviceId}:`, err);
            return false;
        }
    }

    /**
     * Get online status for multiple devices in bulk
     */
    async getStatuses(deviceIds: string[]): Promise<Record<string, boolean>> {
        if (deviceIds.length === 0) return {};

        try {
            const keys = deviceIds.map(id => `${PresenceService.PRESENCE_KEY_PREFIX}${id}`);
            const results = await redis.mget(...keys);

            const statusMap: Record<string, boolean> = {};
            deviceIds.forEach((id, index) => {
                statusMap[id] = results[index] === '1';
            });

            return statusMap;
        } catch (err) {
            logger.error('[PresenceService] Bulk status fetch failed:', err);
            return {};
        }
    }
}

export const presenceService = new PresenceService();
