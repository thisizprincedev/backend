import { connect, NatsConnection, JSONCodec } from 'nats';
import jwt from 'jsonwebtoken';
import config from '../config/env';
import logger from '../utils/logger';

export class NatsAuthService {
    private nc: NatsConnection | null = null;
    private jc = JSONCodec();

    async init() {
        if (this.nc) return;

        try {
            logger.info(`[NatsAuth] Connecting to NATS using Username/Password...`);

            // Connect simply
            this.nc = await connect({
                servers: config.mqtt.url.replace('mqtt://', 'nats://').replace(':1883', ':4222'),
                user: config.nats.user,
                pass: config.nats.pass
            });

            logger.info(`[NatsAuth] Connected to NATS. Handling calls on $SYS.REQ.USER.AUTH`);

            // Listen for device auth requests
            const sub = this.nc.subscribe('$SYS.REQ.USER.AUTH');
            (async () => {
                for await (const m of sub) {
                    await this.handleAuthRequest(m);
                }
            })();

        } catch (err) {
            logger.error('[NatsAuth] Failed to initialize:', err);
        }
    }

    private async handleAuthRequest(msg: any) {
        try {
            const request = this.jc.decode(msg.data) as any;
            const deviceId = request.client_info?.user || request.connect_opts?.user;
            const token = request.client_info?.pass || request.connect_opts?.pass;

            // ⚡ Case 1: Simple Device validation with JWT
            try {
                const decoded = jwt.verify(token, config.jwt.secret) as any;
                if (decoded.sub !== deviceId) throw new Error('Identity mismatch');

                // Return simple JSON permissions (NATS accepts this if no issuer is set)
                return msg.respond(this.jc.encode({
                    nats: {
                        allow: true,
                        user: deviceId,
                        permissions: {
                            pub: { allow: [`devices/${deviceId}/>`] },
                            sub: { allow: [`devices/${deviceId}/>`] }
                        }
                    }
                }));
            } catch (jwtErr) {
                logger.warn(`[NatsAuth] Denied connection for ${deviceId}`);
                return msg.respond(this.jc.encode({ nats: { allow: false, reason: 'Invalid Token' } }));
            }

        } catch (err) {
            logger.error('[NatsAuth] Error handling request:', err);
        }
    }
}

export const natsAuthService = new NatsAuthService();
