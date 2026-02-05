import { createClient } from '@supabase/supabase-js';
import config from '../config/env';
import logger from './logger';

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

/**
 * Log a user action to the database
 */
export const logActivity = async (params: {
    userId: string | number;
    action: string;
    details?: any;
    ip?: string;
    userAgent?: string;
}) => {
    try {
        const { error } = await supabase
            .from('user_action_logs')
            .insert({
                user_id: params.userId.toString(),
                action: params.action,
                details: params.details || {},
                ip_address: params.ip,
                user_agent: params.userAgent,
            });

        if (error) {
            logger.error(error, 'Database audit log error:');
        }
    } catch (error) {
        logger.error(error, 'Audit log utility error:');
    }
};
