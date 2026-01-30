import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import config from '../../config/env';
import logger from '../../utils/logger';

const router = Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

/**
 * Register new user
 * POST /api/v1/auth/register
 */
router.post('/register', async (req, res) => {
    try {
        const { email, password, displayName } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        // Check if user exists
        const { data: existingUser } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('email', email)
            .maybeSingle();

        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user in database
        // Generate a pseudo-provider ID for consistency if not using external auth
        const providerId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const { data: user, error } = await supabase
            .from('user_profiles')
            .insert([{
                email,
                password_hash: hashedPassword,
                display_name: displayName || email.split('@')[0],
                role: 'viewer',
                supabase_user_id: providerId,
                firebase_uid: providerId
            }])
            .select()
            .single();

        if (error) throw error;

        // Generate JWT token
        const token = jwt.sign(
            { id: user.id.toString(), email: user.email, role: user.role },
            config.jwt.secret,
            { expiresIn: config.jwt.expiresIn as any }
        );

        return res.json({
            success: true,
            user: {
                id: user.id.toString(),
                email: user.email,
                displayName: user.display_name,
                role: user.role,
            },
            token,
        });
    } catch (error: any) {
        logger.error('Registration error:', error.message);
        return res.status(500).json({ error: 'Registration failed' });
    }
});

/**
 * Login user
 * POST /api/v1/auth/login
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        // Get user from database
        const { data: user, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('email', email)
            .maybeSingle();

        if (error || !user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: user.id.toString(), email: user.email, role: user.role },
            config.jwt.secret,
            { expiresIn: config.jwt.expiresIn as any }
        );

        return res.json({
            success: true,
            user: {
                id: user.id.toString(),
                email: user.email,
                displayName: user.display_name,
                role: user.role,
            },
            token,
        });
    } catch (error: any) {
        logger.error('Login error:', error.message);
        return res.status(500).json({ error: 'Login failed' });
    }
});

/**
 * Get current user
 * GET /api/v1/auth/me
 */
router.get('/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.substring(7);

        // Verify JWT token
        const decoded = jwt.verify(token, config.jwt.secret) as any;

        // Get user from database
        const { data: user, error } = await supabase
            .from('user_profiles')
            .select('id, email, display_name, role, created_at')
            .eq('id', decoded.id)
            .single();

        if (error || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        return res.json({
            success: true,
            user: {
                id: user.id.toString(),
                email: user.email,
                displayName: user.display_name,
                role: user.role,
                createdAt: user.created_at,
            },
        });
    } catch (error: any) {
        logger.error('Get user error:', error.message);
        return res.status(401).json({ error: 'Invalid token' });
    }
});

export default router;
