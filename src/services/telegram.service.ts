import axios from 'axios';
import config from '../config/env';
import logger from '../utils/logger';

/**
 * Telegram Service
 * Handles Telegram bot operations for notifications and 2FA
 */
export class TelegramService {
    private botToken: string;
    private adminChatId: string;
    private baseUrl: string;

    constructor() {
        this.botToken = config.telegram.botToken;
        this.adminChatId = config.telegram.adminChatId;
        this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;

        if (!this.botToken) {
            logger.warn('Telegram bot token not configured');
        }
    }

    /**
     * Send message to Telegram chat
     */
    async sendMessage(chatId: string, message: string, parseMode: 'HTML' | 'Markdown' = 'HTML') {
        if (!this.botToken) {
            throw new Error('Telegram bot token not configured');
        }

        try {
            const response = await axios.post(`${this.baseUrl}/sendMessage`, {
                chat_id: chatId,
                text: message,
                parse_mode: parseMode
            });

            logger.debug(`Telegram message sent to ${chatId}`);
            return response.data;
        } catch (error: any) {
            logger.error(`Telegram send error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Send 2FA code via Telegram
     */
    async send2FACode(email: string, code: string, chatId?: string) {
        const targetChatId = chatId || this.adminChatId;

        const message = `🔐 <b>SRM Login Verification</b>\n\n` +
            `Your 2FA code is: <code>${code}</code>\n\n` +
            `Email: ${email}\n` +
            `Valid for: 5 minutes\n\n` +
            `⚠️ Do not share this code with anyone.`;

        return this.sendMessage(targetChatId, message);
    }

    /**
     * Send notification message
     */
    async sendNotification(message: string, chatId?: string) {
        const targetChatId = chatId || this.adminChatId;
        return this.sendMessage(targetChatId, message);
    }

    /**
     * Send alert message
     */
    async sendAlert(title: string, details: string, chatId?: string) {
        const targetChatId = chatId || this.adminChatId;

        const message = `⚠️ <b>${title}</b>\n\n${details}`;
        return this.sendMessage(targetChatId, message);
    }

    /**
     * Send success message
     */
    async sendSuccess(title: string, details: string, chatId?: string) {
        const targetChatId = chatId || this.adminChatId;

        const message = `✅ <b>${title}</b>\n\n${details}`;
        return this.sendMessage(targetChatId, message);
    }

    /**
     * Send error message
     */
    async sendError(title: string, error: string, chatId?: string) {
        const targetChatId = chatId || this.adminChatId;

        const message = `❌ <b>${title}</b>\n\n<code>${error}</code>`;
        return this.sendMessage(targetChatId, message);
    }
}

// Singleton instance
export const telegramService = new TelegramService();
