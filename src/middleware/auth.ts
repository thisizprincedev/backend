import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import config from '../config/env';
import logger from '../utils/logger';

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

// Extend Express Request type
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                uuid?: string;
                email: string;
                role?: string;
                firebase_uid?: string;
            };
            deviceId?: string;
        }
    }
}

/**
 * Resolve UUID and other metadata for a decoded token
 */
async function resolveUserMetadata(decoded: any) {
    if (!decoded || !decoded.id) return null;

    let uuid = decoded.uuid;

    // Fallback: fetch UUID if not in token (for seamless migration of existing sessions)
    // Guard: only query if decoded.id is a number/numeric string to avoid BigInt syntax errors
    if (!uuid && decoded.id && /^\d+$/.test(decoded.id.toString())) {
        try {
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('supabase_user_id')
                .eq('id', decoded.id)
                .single();
            uuid = profile?.supabase_user_id;
        } catch (err) {
            logger.warn(`Failed to resolve metadata for user ${decoded.id}:`, err);
        }
    }

    return {
        id: decoded.id.toString(),
        uuid: uuid,
        email: decoded.email || '',
        role: decoded.role || 'viewer',
        firebase_uid: decoded.firebase_uid,
    };
}

/**
 * Verify JWT token and attach user to request
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.substring(7);

        // Verify JWT token (custom tokens)
        const decoded = jwt.verify(token, config.jwt.secret) as any;

        const user = await resolveUserMetadata(decoded);
        if (!user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        req.user = user;
        return next();

        return next();
    } catch (error: any) {
        logger.error('Authentication error:', error.message);
        return res.status(401).json({ error: 'Invalid token' });
    }
};

/**
 * Optional authentication - doesn't fail if no token
 */
export const optionalAuth = async (req: Request, _res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next();
        }

        const token = authHeader.substring(7);
        // Standardizing: use our custom JWT verification even for optional auth
        // to ensure req.user.id is always our numeric profile ID
        const decoded = jwt.verify(token, config.jwt.secret) as any;

        const user = await resolveUserMetadata(decoded);
        if (user) {
            req.user = user;
        }

        return next();
    } catch (error) {
        // Ignore errors for optional auth
        return next();
    }
};

/**
 * Require specific role
 */
export const requireRole = (roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!req.user.role || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        return next();
    };
};

/**
 * Require admin role - convenience wrapper
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    return requireRole(['admin'])(req, res, next);
};

/**
 * API Key or HMAC authentication for mobile devices with TOFR (Trust on First Registration)
 */
export const authenticateDevice = async (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    const deviceId = req.headers['x-device-id'] || req.query.device_id;

    if (!deviceId) {
        // Fallback to static API key if no device ID is provided (e.g. initial registration)
        if (apiKey === config.auth.mobileApiKey) {
            return next();
        }
        return res.status(401).json({ error: 'Unauthorized: device_id required for authentication' });
    }

    try {

        // Fallback to static API Key (Legacy/Initial Registration)
        if (apiKey === config.auth.mobileApiKey) {
            req.deviceId = deviceId as string;
            return next();
        }

        logger.warn({ deviceId, ip: req.ip }, 'Unauthorized mobile access attempt');
        return res.status(401).json({ error: 'Unauthorized: Missing or Invalid Authentication' });
    } catch (error: any) {
        logger.error({ error: error.message, deviceId }, 'Device authentication error');
        return res.status(500).json({ error: 'Internal authentication error' });
    }
};
