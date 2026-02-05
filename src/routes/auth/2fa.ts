import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { asyncHandler } from '../../middleware/errorHandler';
import { telegramService } from '../../services/telegram.service';
import config from '../../config/env';
import logger from '../../utils/logger';
import { notificationDispatcher } from '../../services/notification.dispatcher';

const router = Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

/**
 * Generate 6-digit 2FA code
 */
function generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * POST /api/v1/auth/2fa/send
 * Send 2FA code via Telegram
 */
router.post('/send', asyncHandler(async (req: Request, res: Response) => {
    const { supabaseUserId, email, telegramChatId } = req.body;

    if (!supabaseUserId || !email) {
        return res.status(400).json({
            success: false,
            error: 'supabaseUserId and email are required'
        });
    }

    // Generate 6-digit code
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Mark old codes as used
    await supabase
        .from('two_factor_codes')
        .update({ used: true })
        .eq('firebase_uid', supabaseUserId)
        .eq('used', false);

    // Store new code
    const { error: insertError } = await supabase
        .from('two_factor_codes')
        .insert({
            firebase_uid: supabaseUserId,
            code: code,
            expires_at: expiresAt.toISOString(),
        });

    if (insertError) {
        logger.error(insertError, 'Error storing 2FA code:');
        return res.status(500).json({
            success: false,
            error: 'Failed to generate code'
        });
    }

    // Send code via Telegram
    try {
        if (!telegramChatId) {
            logger.warn('Cannot send 2FA code: No telegramChatId provided for', email);
            return res.status(400).json({
                success: false,
                error: 'Telegram Chat ID not configured for this user'
            });
        }
        await telegramService.send2FACode(email, code, telegramChatId);
        logger.info(`2FA code sent via Telegram to ${email}`);
    } catch (error: any) {
        logger.error('Telegram error:', error.message);
        return res.status(500).json({
            success: false,
            error: 'Failed to send verification code via Telegram'
        });
    }

    return res.json({
        success: true,
        expiresAt: expiresAt.toISOString()
    });
}));

/**
 * POST /api/v1/auth/2fa/verify
 * Verify 2FA code
 */
router.post('/verify', asyncHandler(async (req: Request, res: Response) => {
    const { supabaseUserId, code } = req.body;

    if (!supabaseUserId || !code) {
        return res.status(400).json({
            success: false,
            error: 'supabaseUserId and code are required'
        });
    }

    // Find valid code
    const { data: codeRecord, error } = await supabase
        .from('two_factor_codes')
        .select('*')
        .eq('firebase_uid', supabaseUserId)
        .eq('code', code)
        .eq('used', false)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

    if (error || !codeRecord) {
        return res.json({
            success: false,
            error: 'Invalid or expired code'
        });
    }

    // Mark code as used
    await supabase
        .from('two_factor_codes')
        .update({ used: true })
        .eq('id', codeRecord.id);

    // Get user for token generation
    const { data: user, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', supabaseUserId)
        .single();

    if (profileError || !user) {
        logger.error(profileError, 'Error fetching user for 2FA token:');
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }

    // Generate JWT token
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
        {
            id: user.id.toString(),
            email: user.email,
            role: user.role,
            firebase_uid: user.firebase_uid
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn as any }
    );

    // Send notification
    await notificationDispatcher.sendLoginAlert(user.id, req.ip, req.headers['user-agent'] as string);

    return res.json({
        success: true,
        token,
        user: {
            id: user.id.toString(),
            email: user.email,
            displayName: user.display_name,
            role: user.role,
        }
    });
}));

export default router;
