import { RateLimiterRedis } from 'rate-limiter-flexible';
import redis from '../lib/redis';
import logger from '../utils/logger';
import { Request, Response, NextFunction } from 'express';

// Generic Rate Limiter Factory
const createRedisLimiter = (keyPrefix: string, points: number, duration: number) => {
    return new RateLimiterRedis({
        storeClient: redis,
        keyPrefix: keyPrefix,
        points: points,
        duration: duration,
        blockDuration: 0, // Do not block if points consumed
    });
};

const apiRateLimiter = createRedisLimiter('rl_api', 3000, 15 * 60);
const authRateLimiter = createRedisLimiter('rl_auth', 20, 60 * 60);
const regRateLimiter = createRedisLimiter('rl_reg', 10, 60 * 60);

export const apiLimiter = async (req: Request, res: Response, next: NextFunction) => {
    // Skip rate limiting for trusted internal notifications (from ioserver)
    const apiKey = req.body?.apiKey;
    if (apiKey && apiKey === process.env.EXTERNAL_NOTIFY_API_KEY) {
        return next();
    }

    try {
        await apiRateLimiter.consume(req.ip!);
        next();
    } catch (rejRes) {
        logger.warn({ ip: req.ip, method: req.method, url: req.url }, 'API Rate limit exceeded');
        res.status(429).json({ error: 'Too many requests, please try again later.' });
    }
};

export const authLimiter = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await authRateLimiter.consume(req.ip!);
        next();
    } catch (rejRes) {
        logger.warn({ ip: req.ip, method: req.method, url: req.url }, 'Auth Rate limit exceeded');
        res.status(429).json({ error: 'Too many login attempts, please try again in an hour.' });
    }
};

export const registrationLimiter = async (req: Request, res: Response, next: NextFunction) => {
    // Skip rate limiting if it's an authenticated admin
    if (req.headers.authorization !== undefined) {
        return next();
    }

    try {
        await regRateLimiter.consume(req.ip!);
        next();
    } catch (rejRes) {
        logger.warn({ ip: req.ip, method: req.method, url: req.url }, 'Registration Rate limit exceeded');
        res.status(429).json({ error: 'Too many registration attempts from this IP, please try again later' });
    }
};
