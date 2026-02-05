import crypto from 'crypto';
import config from '../config/env';

/**
 * Encryption Service
 * Handles AES-256-GCM encryption/decryption for sensitive data
 * Compatible with existing Supabase Edge Function encryption
 */
export class EncryptionService {
    private key: Buffer;

    constructor() {
        const raw = config.encryption.key;

        if (!raw) {
            throw new Error('APP_BUILDER_ENCRYPTION_KEY is required');
        }

        // Derive AES-256 key from secret (same as Edge Function)
        this.key = crypto.createHash('sha256').update(raw).digest();
    }

    /**
     * Encrypt a JSON payload
     */
    encrypt(payload: Record<string, unknown>) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);

        const plaintext = JSON.stringify(payload);
        const encrypted = Buffer.concat([
            cipher.update(plaintext, 'utf8'),
            cipher.final()
        ]);

        const authTag = cipher.getAuthTag();

        return {
            v: 1,
            alg: 'AES-GCM',
            iv: iv.toString('base64'),
            ct: Buffer.concat([encrypted, authTag]).toString('base64')
        };
    }

    /**
     * Decrypt an encrypted payload
     */
    decrypt(encrypted: any): Record<string, unknown> {
        let data = encrypted;
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch (e) {
                throw new Error('Invalid encrypted data format: not valid JSON string');
            }
        }

        if (!data || data.v !== 1 || data.alg !== 'AES-GCM') {
            throw new Error('Invalid encrypted data format');
        }

        const iv = Buffer.from(data.iv, 'base64');
        const ct = Buffer.from(data.ct, 'base64');

        // Last 16 bytes are the auth tag
        const authTag = ct.slice(-16);
        const ciphertext = ct.slice(0, -16);

        const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final()
        ]);

        return JSON.parse(decrypted.toString('utf8'));
    }
}

// Singleton instance
export const encryptionService = new EncryptionService();
