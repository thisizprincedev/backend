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
            logger.error(err, `[PresenceService] Failed to mark device ${deviceId} online:`);
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
            logger.error(err, `[PresenceService] Failed to mark device ${deviceId} offline:`);
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
            logger.error(err, `[PresenceService] Failed to check status for ${deviceId}:`);
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
            logger.error(err, '[PresenceService] Bulk status fetch failed:');
            return {};
        }
    }

    /**
     * Clear all presence keys (Cleanup on startup)
     */
    async clearAll(): Promise<void> {
        try {
            const keys = await redis.keys(`${PresenceService.PRESENCE_KEY_PREFIX}*`);
            if (keys.length > 0) {
                await redis.del(...keys);
                logger.info(`[PresenceService] Cleared ${keys.length} stale presence keys.`);
            }
        } catch (err) {
            logger.error(err, '[PresenceService] Failed to clear presence keys:');
        }
    }
}

export const presenceService = new PresenceService();
