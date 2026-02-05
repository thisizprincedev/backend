import Redis from 'ioredis';
import config from '../config/env';
import logger from '../utils/logger';

const redis = new Redis(config.redis.url);

redis.on('connect', () => {
    logger.info('Redis connected successfully');
});

redis.on('error', (err) => {
    logger.error(err, 'Redis connection error:');
});

export default redis;
