import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import config from '../../config/env';
import { authenticate } from '../../middleware/auth';
import logger from '../../utils/logger';
import { io } from '../../index';
import { ProviderFactory } from '../../providers/factory';

const router = Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

/**
 * List device commands
 * GET /api/v1/device-commands
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const { deviceId, status, limit = 50 } = req.query;

        let query = supabase
            .from('device_commands')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(Number(limit));

        if (deviceId) {
            query = query.eq('device_id', deviceId);
        }

        if (status) {
            query = query.eq('status', status);
        }

        const { data: commands, error } = await query;

        if (error) throw error;

        return res.json({
            success: true,
            commands,
        });
    } catch (error: any) {
        logger.error('List commands error:', error.message);
        return res.status(500).json({ error: 'Failed to list commands' });
    }
});

/**
 * Create device command
 * POST /api/v1/device-commands
 */
router.post('/', authenticate, async (req, res) => {
    try {
        const { deviceId, command, payload, appId } = req.body;

        if (!deviceId || !command) {
            return res.status(400).json({ error: 'deviceId and command are required' });
        }

        const provider = await ProviderFactory.getProvider(appId);
        const cmd = await provider.sendCommand(deviceId, command, payload);

        return res.json({
            success: true,
            command: cmd,
        });
    } catch (error: any) {
        logger.error('Create command error:', error.message);
        return res.status(500).json({ error: 'Failed to create command' });
    }
});

/**
 * Get device command
 * GET /api/v1/device-commands/:id
 */
router.get('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: command, error } = await supabase
            .from('device_commands')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!command) {
            return res.status(404).json({ error: 'Command not found' });
        }

        return res.json({
            success: true,
            command,
        });
    } catch (error: any) {
        logger.error('Get command error:', error.message);
        return res.status(500).json({ error: 'Failed to get command' });
    }
});

/**
 * Update device command status
 * PATCH /api/v1/device-commands/:id
 */
router.patch('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, result, error: cmdError } = req.body;

        const updates: any = {};
        if (status) updates.status = status;
        if (result !== undefined) updates.result = result;
        if (cmdError !== undefined) updates.error = cmdError;
        updates.updated_at = new Date().toISOString();

        const { data: command, error } = await supabase
            .from('device_commands')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Emit real-time update
        io.to(`commands-${command.device_id}`).emit('command_change', { eventType: 'UPDATE', new: command });
        io.emit('command_change', { eventType: 'UPDATE', new: command });

        return res.json({
            success: true,
            command,
        });
    } catch (error: any) {
        logger.error('Update command error:', error.message);
        return res.status(500).json({ error: 'Failed to update command' });
    }
});

/**
 * Delete device command
 * DELETE /api/v1/device-commands/:id
 */
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('device_commands')
            .delete()
            .eq('id', id);

        if (error) throw error;

        // Emit real-time update
        io.emit('command_change', { eventType: 'DELETE', old: { id } });

        return res.json({
            success: true,
            message: 'Command deleted successfully',
        });
    } catch (error: any) {
        logger.error('Delete command error:', error.message);
        return res.status(500).json({ error: 'Failed to delete command' });
    }
});

export default router;
