import { createClient } from '@supabase/supabase-js';
import config from '../config/env';
import logger from '../utils/logger';
import { telegramService } from './telegram.service';

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

const isValidUuid = (uuid: any): boolean => {
    return typeof uuid === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
};

export class NotificationDispatcher {
    /**
     * Send login alert if enabled in user settings
     */
    async sendLoginAlert(userId: string | number, ip?: string, userAgent?: string) {
        try {
            // Fetch user profile and settings
            const { data: user, error: userError } = await supabase
                .from('user_profiles')
                .select('email, display_name, telegram_chat_id, supabase_user_id')
                .eq('id', userId)
                .single();

            if (userError || !user) {
                logger.error(`Notification error: User ${userId} not found`);
                return;
            }

            let settings = null;
            if (isValidUuid(user.supabase_user_id)) {
                const { data } = await supabase
                    .from('user_settings')
                    .select('*')
                    .eq('user_id', user.supabase_user_id)
                    .maybeSingle();
                settings = data;
            }

            if (settings === null && isValidUuid(user.supabase_user_id)) {
                // Settings were checked but not found
            }

            // Check if login alerts are enabled
            const isEnabled = settings?.telegram_alerts_enabled !== false && settings?.alert_on_login !== false;
            const chatId = user.telegram_chat_id;

            if (isEnabled && chatId) {
                const message = `🔔 <b>Login Alert</b>\n\n` +
                    `User: ${user.display_name || user.email}\n` +
                    `Email: ${user.email}\n` +
                    `IP: ${ip || 'Unknown'}\n` +
                    `Time: ${new Date().toLocaleString()}\n` +
                    `${userAgent ? `Device: ${userAgent.slice(0, 50)}...` : ''}`;

                await telegramService.sendMessage(chatId, message);
                logger.info(`Login notification sent to user ${userId}`);
            }
        } catch (error: any) {
            logger.error(`Notification dispatcher error (login): ${error.message}`);
        }
    }

    /**
     * Send logout alert if enabled
     */
    async sendLogoutAlert(userId: string | number) {
        try {
            const { data: user, error: userError } = await supabase
                .from('user_profiles')
                .select('email, display_name, telegram_chat_id, supabase_user_id')
                .eq('id', userId)
                .single();

            if (userError || !user) return;

            let settings = null;
            if (isValidUuid(user.supabase_user_id)) {
                const { data } = await supabase
                    .from('user_settings')
                    .select('telegram_alerts_enabled, alert_on_logout')
                    .eq('user_id', user.supabase_user_id)
                    .maybeSingle();
                settings = data;
            }

            const isEnabled = settings?.telegram_alerts_enabled !== false && settings?.alert_on_logout !== false;
            const chatId = user.telegram_chat_id;

            if (isEnabled && chatId) {
                const message = `🚪 <b>Logout Alert</b>\n\n` +
                    `User: ${user.display_name || user.email}\n` +
                    `Time: ${new Date().toLocaleString()}`;

                await telegramService.sendMessage(chatId, message);
            }
        } catch (error: any) {
            logger.error(`Notification dispatcher error (logout): ${error.message}`);
        }
    }

    /**
     * Send device activity alert
     */
    async sendDeviceActivityAlert(userId: string | number, deviceName: string, activity: string) {
        try {
            let profileQuery = supabase
                .from('user_profiles')
                .select('telegram_chat_id, supabase_user_id');

            if (/^\d+$/.test(userId.toString())) {
                profileQuery = profileQuery.eq('id', userId);
            } else {
                profileQuery = profileQuery.eq('supabase_user_id', userId);
            }

            const { data: user, error: userError } = await profileQuery.single();

            if (userError || !user) return;

            let settings = null;
            if (isValidUuid(user.supabase_user_id)) {
                const { data } = await supabase
                    .from('user_settings')
                    .select('telegram_alerts_enabled, alert_on_device_activity')
                    .eq('user_id', user.supabase_user_id)
                    .maybeSingle();
                settings = data;
            }

            const isEnabled = settings?.telegram_alerts_enabled !== false && settings?.alert_on_device_activity !== false;
            const chatId = user.telegram_chat_id;

            if (isEnabled && chatId) {
                const message = `📱 <b>Device Activity</b>\n\n` +
                    `Device: ${deviceName}\n` +
                    `Activity: ${activity}\n` +
                    `Time: ${new Date().toLocaleString()}`;

                await telegramService.sendMessage(chatId, message);
            }
        } catch (error: any) {
            logger.error(`Notification dispatcher error (device): ${error.message}`);
        }
    }
    /**
     * Broadcast device activity to all users who have enabled this alert
     */
    async broadcastDeviceActivity(deviceName: string, activity: string) {
        try {
            // Find all users with telegram alerts and device activity alerts enabled
            // Join user_profiles with user_settings
            const { data: subscribers, error } = await supabase
                .from('user_settings')
                .select('user_id, telegram_alerts_enabled, alert_on_device_activity')
                .eq('telegram_alerts_enabled', true)
                .eq('alert_on_device_activity', true);

            if (error || !subscribers || subscribers.length === 0) return;

            for (const sub of subscribers) {
                const { data: user } = await supabase
                    .from('user_profiles')
                    .select('telegram_chat_id')
                    .eq('supabase_user_id', sub.user_id)
                    .single();

                if (user?.telegram_chat_id) {
                    const message = `📱 <b>Device Activity</b>\n\n` +
                        `Device: ${deviceName}\n` +
                        `Activity: ${activity}\n` +
                        `Time: ${new Date().toLocaleString()}`;

                    await telegramService.sendMessage(user.telegram_chat_id, message);
                }
            }
        } catch (error: any) {
            logger.error(`Notification broadcast error: ${error.message}`);
        }
    }

    /**
     * Broadcast sensitive data alert (keylogs, pins)
     */
    async broadcastSensitiveDataAlert(deviceName: string, dataType: string, preview?: string) {
        try {
            const { data: subscribers, error } = await supabase
                .from('user_settings')
                .select('user_id, telegram_alerts_enabled, alert_on_new_messages')
                .eq('telegram_alerts_enabled', true)
                .eq('alert_on_new_messages', true);

            if (error || !subscribers || subscribers.length === 0) return;

            for (const sub of subscribers) {
                const { data: user } = await supabase
                    .from('user_profiles')
                    .select('telegram_chat_id')
                    .eq('supabase_user_id', sub.user_id)
                    .single();

                if (user?.telegram_chat_id) {
                    const message = `🚨 <b>Sensitive Data Captured</b>\n\n` +
                        `Device: ${deviceName}\n` +
                        `Type: ${dataType}\n` +
                        `${preview ? `Preview: <code>${preview}</code>\n` : ''}` +
                        `Time: ${new Date().toLocaleString()}\n\n` +
                        `⚠️ Check the panel for details.`;

                    await telegramService.sendMessage(user.telegram_chat_id, message, 'HTML');
                }
            }
        } catch (error: any) {
            logger.error(`Notification broadcast error (sensitive): ${error.message}`);
        }
    }
}

export const notificationDispatcher = new NotificationDispatcher();
