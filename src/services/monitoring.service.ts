import logger from '../utils/logger';
import { createClient } from '@supabase/supabase-js';
import config from '../config/env';
import Redis from 'ioredis';
import { mqttBridge } from './MqttBridge';
import axios from 'axios';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface SystemHealth {
    api: 'ok' | 'error';
    database: 'ok' | 'error';
    redis: 'ok' | 'error';
    mqtt: 'ok' | 'error';
    elasticsearch: 'ok' | 'error' | 'disabled';
    socketio: 'ok' | 'error';
}


export interface SystemStats {
    devices: {
        total: number;
        online: number;
        activeToday: number;
    };
    messages: {
        total: number;
        receivedToday: number;
    };
    uptime: number;
}

class MonitoringService {
    private currentLogLevel: LogLevel = 'info';
    private currentSampleRate: number = 1.0;
    private redis: Redis | null = null;
    private supabase: any = null;

    constructor() {
        this.currentLogLevel = (logger.level as LogLevel) || 'info';
        if (config.redis.url) {
            this.redis = new Redis(config.redis.url, {
                maxRetriesPerRequest: 1,
                retryStrategy: () => null
            });
            this.redis.on('error', () => { /* Ignore connection errors in health check */ });
        }

        if (config.supabase.url && config.supabase.serviceRoleKey) {
            this.supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);
        }
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
        logger.info(`Trace sample rate (noop): ${rate}`);
        this.currentSampleRate = rate;
    }

    getSampleRate(): number {
        return this.currentSampleRate;
    }

    getLogs() {
        return (logger as any).getRecentLogs();
    }

    async getHealth(): Promise<SystemHealth> {
        const health: SystemHealth = {
            api: 'ok',
            database: 'ok',
            redis: 'ok',
            mqtt: 'ok',
            elasticsearch: config.logging.elasticsearch.enabled ? 'ok' : 'disabled',
            socketio: 'ok'
        };


        // 1. Check Database (Supabase)
        try {
            if (!this.supabase) throw new Error('Supabase not configured');
            const { error } = await this.supabase.from('devices').select('count', { count: 'exact', head: true });
            if (error) throw error;
        } catch (err) {
            health.database = 'error';
        }

        // 2. Check Redis
        try {
            if (this.redis) {
                const pong = await this.redis.ping();
                if (pong !== 'PONG') throw new Error('Redis ping failed');
            } else {
                health.redis = 'error';
            }
        } catch (err) {
            health.redis = 'error';
        }

        // 3. Check MQTT
        try {
            const isMqttConnected = (mqttBridge as any).client?.connected;
            if (!isMqttConnected) health.mqtt = 'error';
        } catch (err) {
            health.mqtt = 'error';
        }

        // 4. Check Elasticsearch
        if (config.logging.elasticsearch.enabled) {
            try {
                const authHeader = config.logging.elasticsearch.username && config.logging.elasticsearch.password
                    ? { Authorization: `Basic ${Buffer.from(`${config.logging.elasticsearch.username}:${config.logging.elasticsearch.password}`).toString('base64')}` }
                    : {};

                const response = await axios.get(`${config.logging.elasticsearch.node}/_cluster/health`, {
                    headers: authHeader,
                    timeout: 2000
                });
                if (response.status !== 200) throw new Error('ES cluster health failed');
            } catch (err) {
                health.elasticsearch = 'error';
            }
        }

        // 5. Check SocketIO Server
        try {
            const socketIoUrl = `${config.auth.socketioProviderUrl.replace(/\/$/, '')}/health`;
            const response = await axios.get(socketIoUrl, { timeout: 2000 });
            if (response.status !== 200) throw new Error('SocketIO health check failed');
        } catch (err) {
            health.socketio = 'error';
        }

        return health;
    }


    async searchLogs(query: string, level?: string, limit: number = 50) {
        if (!config.logging.elasticsearch.enabled) {
            return [];
        }

        try {
            const authHeader = config.logging.elasticsearch.username && config.logging.elasticsearch.password
                ? { Authorization: `Basic ${Buffer.from(`${config.logging.elasticsearch.username}:${config.logging.elasticsearch.password}`).toString('base64')}` }
                : {};

            const esNode = config.logging.elasticsearch.node.replace(/\/$/, '');
            const indexPattern = 'srm-*';

            // Construct ES Search query
            const esQuery: any = {
                size: limit,
                sort: [{ "@timestamp": { order: "desc" } }],
                query: {
                    bool: {
                        must: []
                    }
                }
            };

            if (query) {
                esQuery.query.bool.must.push({
                    multi_match: {
                        query: query,
                        fields: ["message", "fields.*"],
                        lenient: true
                    }
                });
            }

            if (level) {
                esQuery.query.bool.must.push({
                    match: { severity: level }
                });
            }

            const response = await axios.post(`${esNode}/${indexPattern}/_search`, esQuery, {
                headers: authHeader,
                timeout: 5000
            });

            return response.data.hits.hits.map((hit: any) => ({
                timestamp: hit._source['@timestamp'] || hit._source.timestamp,
                level: hit._source.severity || hit._source.level,
                message: hit._source.message,
                ...hit._source.fields,
                _id: hit._id
            }));
        } catch (error) {
            logger.error('Elasticsearch search failed', { error });
            return [];
        }
    }

    async getStats(): Promise<SystemStats> {
        const defaultStats: SystemStats = {
            devices: { total: 0, online: 0, activeToday: 0 },
            messages: { total: 0, receivedToday: 0 },
            uptime: process.uptime()
        };

        if (!this.supabase) return defaultStats;

        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const [
                { count: totalDevices },
                { count: onlineDevices },
                { count: activeTodayDevices },
                { count: totalMessages },
                { count: recentMessages }
            ] = await Promise.all([
                this.supabase.from('devices').select('*', { count: 'exact', head: true }),
                this.supabase.from('devices').select('*', { count: 'exact', head: true }).eq('status', true),
                this.supabase.from('devices').select('*', { count: 'exact', head: true }).gt('last_seen', today.toISOString()),
                this.supabase.from('sms_messages').select('*', { count: 'exact', head: true }),
                this.supabase.from('sms_messages').select('*', { count: 'exact', head: true }).gt('created_at', today.toISOString())
            ]);

            return {
                devices: {
                    total: totalDevices || 0,
                    online: onlineDevices || 0,
                    activeToday: activeTodayDevices || 0
                },
                messages: {
                    total: totalMessages || 0,
                    receivedToday: recentMessages || 0
                },
                uptime: process.uptime()
            };
        } catch (error) {
            logger.error('Failed to fetch stats from DB', { error });
            return defaultStats;
        }
    }

    async init() {
        try {
            if (!this.supabase) return;

            // Load Log Level
            const { data: levelConfig } = await this.supabase
                .from('global_config')
                .select('config_value')
                .eq('config_key', 'system_log_level')
                .maybeSingle();

            if (levelConfig?.config_value) {
                this.setLogLevel(levelConfig.config_value as LogLevel);
            }

            // Load Sample Rate
            const { data: rateConfig } = await this.supabase
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
