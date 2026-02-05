import logger from '../utils/logger';
import { createClient } from '@supabase/supabase-js';
import config from '../config/env';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class MonitoringService {
    private currentLogLevel: LogLevel = 'info';
    private currentSampleRate: number = 1.0;

    constructor() {
        this.currentLogLevel = (logger.level as LogLevel) || 'info';
    }

    setLogLevel(level: LogLevel) {
        logger.info(`Setting log level to: ${level}`);
        logger.level = level;
        this.currentLogLevel = level;
    }

    getLogLevel(): LogLevel {
        return this.currentLogLevel;
    }

    setTraceSampleRate(rate: number) {
        logger.info(`Setting trace sample rate to: ${rate}`);
        // Note: dd-trace might not support updating global sampleRate at runtime easily 
        // without rule sets, but we can attempt to update the tracer options if exposed
        // or just store it for future rule applications.
        // For now, we'll log it and note that a restart might be required for global 
        // unless we use specific sampling rules.
        this.currentSampleRate = rate;
    }

    getSampleRate(): number {
        return this.currentSampleRate;
    }

    async init() {
        try {
            const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

            // Load Log Level
            const { data: levelConfig } = await supabase
                .from('global_config')
                .select('config_value')
                .eq('config_key', 'system_log_level')
                .maybeSingle();

            if (levelConfig?.config_value) {
                this.setLogLevel(levelConfig.config_value as LogLevel);
            }

            // Load Sample Rate
            const { data: rateConfig } = await supabase
                .from('global_config')
                .select('config_value')
                .eq('config_key', 'system_trace_sample_rate')
                .maybeSingle();

            if (rateConfig?.config_value) {
                this.setTraceSampleRate(parseFloat(rateConfig.config_value as string));
            }
        } catch (err) {
            logger.warn({ err }, 'Failed to initialize monitoring settings from DB');
        }
    }
}

export const monitoringService = new MonitoringService();
