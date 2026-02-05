import { google } from 'googleapis';
import axios from 'axios';
import config from '../config/env';
import logger from '../utils/logger';

/**
 * Firebase Service
 * Handles Firebase Realtime Database operations via REST API
 * Uses service account for authentication
 */
export class FirebaseService {
    private serviceAccount: any;

    constructor() {
        this.serviceAccount = config.firebase.serviceAccount;

        if (this.serviceAccount && this.serviceAccount.private_key) {
            // Fix OpenSSL 3.0 issue: ensure literal \n are true newlines
            // Also strip any accidental wrapping quotes that might have survived parsing
            let key = this.serviceAccount.private_key.trim();

            if (key.startsWith("'") && key.endsWith("'")) key = key.substring(1, key.length - 1);
            if (key.startsWith('"') && key.endsWith('"')) key = key.substring(1, key.length - 1);

            this.serviceAccount.private_key = key.replace(/\\n/g, '\n');

            logger.debug({
                keyStart: this.serviceAccount.private_key.substring(0, 30),
                keyEnd: this.serviceAccount.private_key.substring(this.serviceAccount.private_key.length - 30)
            }, 'Firebase private key sanitized');
        }

        if (!this.serviceAccount) {
            logger.warn('Firebase service account not configured');
        }
    }

    /**
     * Get Firebase access token using service account
     */
    async getAccessToken(): Promise<string> {
        if (!this.serviceAccount) {
            throw new Error('Firebase service account not configured');
        }

        const jwtClient = new google.auth.JWT(
            this.serviceAccount.client_email,
            undefined,
            this.serviceAccount.private_key,
            [
                'https://www.googleapis.com/auth/firebase.database',
                'https://www.googleapis.com/auth/userinfo.email'
            ]
        );

        const tokens = await jwtClient.authorize();

        if (!tokens.access_token) {
            throw new Error('Failed to get Firebase access token');
        }

        return tokens.access_token;
    }

    /**
     * Read data from Firebase Realtime Database
     */
    async read(databaseUrl: string, path: string): Promise<any> {
        try {
            const token = await this.getAccessToken();
            const url = `${databaseUrl.replace(/\/$/, '')}/${path}.json`;

            logger.debug(`Firebase read: ${path}`);
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data;
        } catch (error: any) {
            logger.error(`Firebase read error: ${error.message}`);

            // Check for permission errors
            if (error.response?.status === 401 || error.response?.status === 403) {
                return null;
            }

            throw error;
        }
    }

    /**
     * Write data to Firebase Realtime Database
     */
    async write(databaseUrl: string, path: string, data: any): Promise<any> {
        try {
            const token = await this.getAccessToken();
            const url = `${databaseUrl.replace(/\/$/, '')}/${path}.json`;

            logger.debug(`Firebase write: ${path}`);
            const response = await axios.put(url, data, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data;
        } catch (error: any) {
            logger.error(`Firebase write error: ${error.message}`);

            if (error.response?.status === 401 || error.response?.status === 403) {
                return { error: 'Permission denied', useClientAuth: true };
            }

            throw error;
        }
    }

    /**
     * Delete data from Firebase Realtime Database
     */
    async delete(databaseUrl: string, path: string): Promise<any> {
        try {
            const token = await this.getAccessToken();
            const url = `${databaseUrl.replace(/\/$/, '')}/${path}.json`;

            logger.debug(`Firebase delete: ${path}`);
            const response = await axios.delete(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data;
        } catch (error: any) {
            logger.error(`Firebase delete error: ${error.message}`);

            if (error.response?.status === 401 || error.response?.status === 403) {
                return { error: 'Permission denied', useClientAuth: true };
            }

            throw error;
        }
    }

    /**
     * Proxy Firebase operation (read/write/delete)
     */
    async proxy(action: 'read' | 'write' | 'delete', databaseUrl: string, path: string, data?: any) {
        switch (action) {
            case 'read':
                return this.read(databaseUrl, path);
            case 'write':
                return this.write(databaseUrl, path, data);
            case 'delete':
                return this.delete(databaseUrl, path);
            default:
                throw new Error(`Invalid action: ${action}`);
        }
    }
}

// Singleton instance
export const firebaseService = new FirebaseService();
