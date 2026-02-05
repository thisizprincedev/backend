import axios, { AxiosInstance } from 'axios';
import logger from '../utils/logger';

/**
 * GeeLark API Service
 * Handles all GeeLark cloud phone operations
 * Updated to match validated legacy implementation patterns
 */
export class GeelarkService {
    private baseUrl = 'https://openapi.geelark.com/open/v1';
    private client: AxiosInstance;

    constructor() {
        this.client = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    /**
     * Generate unique trace ID for request tracking
     */
    private generateTraceId(): string {
        return Date.now().toString() + Math.random().toString(36).substring(2, 8);
    }

    /**
     * Make authenticated request to GeeLark API
     */
    private async request(endpoint: string, apiKey: string, data: any = {}) {
        const traceId = this.generateTraceId();

        try {
            logger.debug(`GeeLark ${endpoint} request with traceId: ${traceId}`);

            const response = await this.client.post(endpoint, data, {
                headers: {
                    'traceId': traceId,
                    'Authorization': `Bearer ${apiKey}`
                }
            });

            return { ...response.data, traceId };
        } catch (error: any) {
            logger.error(`GeeLark ${endpoint} error:`, error.response?.data || error.message);
            // Return the actual error from GeeLark if available
            if (error.response?.data) {
                return { ...error.response.data, traceId };
            }
            throw error;
        }
    }

    /**
     * List cloud phones
     */
    async listPhones(apiKey: string, params: {
        page?: number;
        pageSize?: number;
        ids?: string[];
        serialName?: string;
        remark?: string;
        groupName?: string;
        tags?: string[];
        chargeMode?: number;
        openStatus?: number;
    }) {
        return this.request('/phone/list', apiKey, {
            page: params.page || 1,
            pageSize: params.pageSize || 100,
            ...params
        });
    }

    /**
     * Create cloud phone
     */
    async createPhone(apiKey: string, params: any) {
        return this.request('/phone/create', apiKey, params);
    }

    /**
     * Delete cloud phone
     */
    async deletePhone(apiKey: string, phoneId: string) {
        // Bulk delete endpoint expects "ids" array
        return this.request('/phone/delete', apiKey, { ids: [phoneId] });
    }

    /**
     * Start cloud phone
     */
    async startPhone(apiKey: string, phoneId: string) {
        // Bulk start endpoint expects "ids" array
        // Default values from legacy geelark-start function
        return this.request('/phone/start', apiKey, {
            ids: [phoneId],
            hideSideBar: false,
            displayTimer: false,
            width: 336,
            center: 1,
            hideLibrary: false,
            hideMirror: false
        });
    }

    /**
     * Send SMS from cloud phone
     */
    async sendSms(apiKey: string, phoneId: string, phoneNumber: string, text: string) {
        return this.request('/phone/sendSms', apiKey, {
            id: phoneId,
            phoneNumber,
            text
        });
    }

    /**
     * Control cloud phone (restart, stop, etc.)
     */
    async controlPhone(apiKey: string, phoneId: string, action: string, extra: any = {}) {
        let endpoint = '/phone/stop';
        let payload: any = { ids: [phoneId] };

        switch (action) {
            case 'start':
                return this.startPhone(apiKey, phoneId);
            case 'close':
            case 'stop':
                endpoint = '/phone/stop';
                payload = { ids: [phoneId] };
                break;
            case 'restart':
                endpoint = '/phone/restart';
                payload = { ids: [phoneId] };
                break;
            case 'sync':
                endpoint = '/phone/sync';
                payload = { ids: [phoneId] };
                break;
            case 'screenshot':
                return this.screenshot(apiKey, phoneId, 'capture');
            case 'sendSms':
                return this.sendSms(apiKey, phoneId, extra.phoneNumber, extra.text);
            default:
                throw new Error(`Unsupported control action: ${action}`);
        }

        return this.request(endpoint, apiKey, payload);
    }


    /**
     * Take screenshot
     */
    async screenshot(apiKey: string, phoneId: string, action: string = 'capture', taskId?: string) {
        if (action === 'query') {
            return this.request('/phone/screenShot/result', apiKey, { taskId });
        }
        // Capture uses case-sensitive "screenShot" endpoint and "id" parameter
        return this.request('/phone/screenShot', apiKey, { id: phoneId });
    }

    /**
     * Get installed apps
     */
    async getPhoneApps(apiKey: string, phoneId: string) {
        // Apps API uses "/app/list" and "envId" instead of "phone/apps" and "id"
        return this.request('/app/list', apiKey, {
            envId: phoneId,
            page: 1,
            pageSize: 100
        });
    }

    /**
     * Download app to phone
     */
    async downloadApp(apiKey: string, phoneId: string, appUrl: string) {
        // App install uses "/app/install" and "envId"
        return this.request('/app/install', apiKey, {
            envId: phoneId,
            url: appUrl
        });
    }

    /**
     * Google login automation
     */
    async googleLogin(apiKey: string, phoneId: string, email: string, password: string) {
        // RPA task for Google login
        const scheduledTime = Math.floor(Date.now() / 1000) + 10;
        return this.request('/rpa/task/googleLogin', apiKey, {
            id: phoneId,
            email,
            password,
            scheduleAt: scheduledTime
        });
    }

    /**
     * List phone brands
     */
    async listBrands(apiKey: string) {
        return this.request('/phone/brands', apiKey);
    }

    /**
     * List phone groups
     */
    async listGroups(apiKey: string) {
        return this.request('/phone/groups', apiKey);
    }

    /**
     * List async tasks
     */
    async listTasks(apiKey: string, params: any) {
        const { action = 'history', size = 100, lastId, ids, id, searchAfter } = params;
        let endpoint = '/task/historyRecords';
        let payload: any = { size };

        switch (action) {
            case 'history':
                endpoint = '/task/historyRecords';
                payload = { size };
                if (lastId) payload.lastId = lastId;
                if (ids && ids.length > 0) payload.ids = ids;
                break;
            case 'query':
                endpoint = '/task/query';
                payload = { ids: ids || [] };
                break;
            case 'cancel':
                endpoint = '/task/cancel';
                payload = { ids: ids || [] };
                break;
            case 'restart':
                endpoint = '/task/restart';
                payload = { ids: ids || [] };
                break;
            case 'detail':
                endpoint = '/task/detail';
                payload = { id };
                if (searchAfter) payload.searchAfter = searchAfter;
                break;
            default:
                endpoint = '/task/historyRecords';
        }

        return this.request(endpoint, apiKey, payload);
    }

    /**
     * Update phone settings
     */
    async updatePhone(apiKey: string, phoneId: string, settings: any) {
        return this.request('/phone/update', apiKey, {
            id: phoneId,
            ...settings
        });
    }

    /**
     * Get cloud phone status
     */
    async getPhoneStatus(apiKey: string, phoneId: string) {
        const result = await this.listPhones(apiKey, { ids: [phoneId] });
        if (result.code === 0 && result.data?.items?.length > 0) {
            return {
                success: true,
                code: 0,
                data: {
                    status: result.data.items[0].openStatus
                }
            };
        }
        return {
            success: false,
            code: result.code || -1,
            error: result.msg || 'Cloud phone not found or API error',
            ...result
        };
    }
}

// Singleton instance
export const geelarkService = new GeelarkService();
