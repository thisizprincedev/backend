import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config/env';
import logger from '../utils/logger';

// Extend Express Request type
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                email: string;
                role?: string;
                firebase_uid?: string;
            };
        }
    }
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

        if (!decoded || !decoded.id) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        // Attach user to request
        // Standardizing: id is the numeric user_profiles.id (as string)
        req.user = {
            id: decoded.id.toString(),
            email: decoded.email || '',
            role: decoded.role || 'viewer',
            firebase_uid: decoded.firebase_uid,
        };

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

        if (decoded && decoded.id) {
            req.user = {
                id: decoded.id.toString(),
                email: decoded.email || '',
                role: decoded.role || 'viewer',
                firebase_uid: decoded.firebase_uid,
            };
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
