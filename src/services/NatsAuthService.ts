import { connect, NatsConnection, JSONCodec, nkeyAuthenticator } from 'nats';
import jwt from 'jsonwebtoken';
import config from '../config/env';
import logger from '../utils/logger';

export class NatsAuthService {
    private nc: NatsConnection | null = null;
    private jc = JSONCodec();

    async init() {
        if (this.nc) return;

        try {
            logger.info(`[NatsAuth] Connecting to NATS for Auth Callout...`);
            const encoder = new TextEncoder();
            this.nc = await connect({
                servers: config.mqtt.url.replace('mqtt://', 'nats://').replace(':1883', ':4222'),
                authenticator: nkeyAuthenticator(encoder.encode(config.nats.bridgeSeed))
            });

            logger.info(`[NatsAuth] Connected. Listening for auth requests on $SYS.REQ.USER.AUTH`);

            // 2. Listen for Auth Callout requests
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
            const deviceId = request.client_info?.user;
            const token = request.client_info?.pass;

            logger.debug(`[NatsAuth] Auth request for device: ${deviceId}`);

            // ⚡ Case 1: The Backend Bridge itself
            if (deviceId === 'srm_backend_admin' && token === config.jwt.secret) {
                return this.respond(msg, {
                    allow: true,
                    permissions: {
                        pub: { allow: ['>'] },
                        sub: { allow: ['>'] }
                    }
                });
            }

            // ⚡ Case 2: Standard Device with JWT
            try {
                const decoded = jwt.verify(token, config.jwt.secret) as any;
                if (decoded.sub !== deviceId) throw new Error('Identity mismatch');

                return this.respond(msg, {
                    allow: true,
                    user: deviceId,
                    permissions: {
                        pub: { allow: [`devices/${deviceId}/>`] },
                        sub: { allow: [`devices/${deviceId}/>`] }
                    }
                });
            } catch (jwtErr) {
                logger.warn(`[NatsAuth] Invalid token for ${deviceId}`);
                return this.respond(msg, { allow: false, reason: 'Invalid Token' });
            }

        } catch (err) {
            logger.error('[NatsAuth] Error handling request:', err);
        }
    }

    private respond(msg: any, response: any) {
        // In a full NATS JWT flow, you would sign the response with the Issuer NKey.
        // For simple NATS 2.10 callouts, NATS accepts the JSON if the responder is trusted.
        msg.respond(this.jc.encode(response));
    }
}

export const natsAuthService = new NatsAuthService();
