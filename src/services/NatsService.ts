import { connect, NatsConnection } from 'nats';
import config from '../config/env';
import logger from '../utils/logger';

/**
 * NatsService provides a shared NATS connection for the backend.
 * Authentication logic has been moved to static users in nats-server.conf.
 */
export class NatsService {
    private nc: NatsConnection | null = null;

    async init() {
        if (this.nc) return;

        try {
            console.log('📡 [NatsService] Attempting connection...');
            logger.info(`[Nats] Connecting to NATS Core...`);

            this.nc = await connect({
                servers: config.mqtt.url.replace('mqtt://', 'nats://').replace(':1883', ':4222'),
                user: config.nats.user,
                pass: config.nats.pass,
                name: "SrmBackend"
            });

            logger.info(`[Nats] Connected successfully.`);

            // 🕵️ Debug: Listen to everything on the 'devices' subject
            const sub = this.nc.subscribe('devices.>');
            (async () => {
                for await (const m of sub) {
                    logger.info(`📡 [NATS TRACE] Received: ${m.subject}`);
                }
            })();

        } catch (err) {
            logger.error(err, '[Nats] Connection failed');
        }
    }

    getConnection(): NatsConnection | null {
        return this.nc;
    }

    async close() {
        if (this.nc) {
            await this.nc.close();
            this.nc = null;
            logger.info('[Nats] Connection closed.');
        }
    }
}

export const natsService = new NatsService();
