import rateLimit from 'express-rate-limit';
import logger from '../utils/logger';

export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3000, // Increased for admin dashboard and high-scale device sync
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: {
        error: 'Too many requests, please try again later.',
    },
    skip: (req) => {
        // Skip rate limiting for trusted internal notifications (from ioserver)
        const apiKey = req.body?.apiKey;
        return !!(apiKey && apiKey === process.env.EXTERNAL_NOTIFY_API_KEY);
    },
    handler: (req, res, _next, options) => {
        logger.warn({ ip: req.ip, method: req.method, url: req.url }, 'Rate limit exceeded');
        res.status(options.statusCode).send(options.message);
    },
});

export const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // Limit each IP to 20 login attempts per hour
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too many login attempts, please try again in an hour.',
    },
});
