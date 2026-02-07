import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import config from '../../config/env';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { telegramService } from '../../services/telegram.service';
import logger from '../../utils/logger';
import { format } from 'date-fns';
import { getIo } from '../../socket';

const router = Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

/**
 * GET /api/v1/cloud-phones/messages
 * List SMS messages with filters
 */
router.get('/', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const {
        geelarkPhoneId,
        deviceName,
        isForwarded,
        limit = 500,
        offset = 0,
        orderBy = 'received_at',
        order = 'desc',
    } = req.query;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    let query = supabase
        .from('cloud_phone_messages')
        .select('*')
        .order(orderBy as string, { ascending: order === 'asc' })
        .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (!isAdmin) {
        // Find all app IDs owned by this user
        const { data: userApps } = await supabase.from('app_builder_apps').select('id').eq('owner_id', userId);
        const appIds = (userApps || []).map(a => a.id);
        const { data: userDevices } = await supabase.from('devices').select('device_id').in('app_id', appIds);
        const deviceIds = (userDevices || []).map(d => d.device_id);
        const { data: cloudDevices } = await supabase.from('cloud_phone_devices').select('geelark_phone_id').in('linked_device_id', deviceIds);
        const ownedPhoneIds = (cloudDevices || []).map(cd => cd.geelark_phone_id);

        if (ownedPhoneIds.length === 0) {
            return res.json({ success: true, messages: [], pagination: { limit: Number(limit), offset: Number(offset), count: 0 } });
        }
        query = query.in('geelark_phone_id', ownedPhoneIds);
    }

    if (geelarkPhoneId) {
        query = query.eq('geelark_phone_id', geelarkPhoneId);
    }

    if (deviceName) {
        query = query.eq('device_name', deviceName);
    }

    if (isForwarded !== undefined) {
        query = query.eq('is_forwarded', isForwarded === 'true');
    }

    const { data: messages, error } = await query;

    if (error) throw error;

    return res.json({
        success: true,
        messages: messages.map(msg => ({
            id: msg.id,
            geelarkPhoneId: msg.geelark_phone_id,
            phoneNumber: msg.phone_number,
            deviceName: msg.device_name,
            sender: msg.sender,
            messageContent: msg.message_content,
            receivedAt: msg.received_at,
            isForwarded: msg.is_forwarded,
            forwardedAt: msg.forwarded_at,
            forwardedTo: msg.forwarded_to,
            createdAt: msg.created_at,
        })),
        pagination: {
            limit: Number(limit),
            offset: Number(offset),
            count: messages.length,
        },
    });
}));

/**
 * GET /api/v1/cloud-phones/messages/:id
 * Get single SMS message
 */
router.get('/:id', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    const { data: message, error } = await supabase
        .from('cloud_phone_messages')
        .select('*')
        .eq('id', id)
        .maybeSingle();

    if (error) throw error;

    if (!message) {
        return res.status(404).json({
            success: false,
            error: 'Message not found',
        });
    }

    // Verify ownership if not admin
    if (!isAdmin) {
        const { data: cloudDevice } = await supabase.from('cloud_phone_devices').select('linked_device_id').eq('geelark_phone_id', message.geelark_phone_id).maybeSingle();
        if (cloudDevice?.linked_device_id) {
            const { data: dbDevice } = await supabase.from('devices').select('app_id').eq('device_id', cloudDevice.linked_device_id).single();
            const { data: app } = await supabase.from('app_builder_apps').select('owner_id').eq('id', dbDevice?.app_id).single();
            if (!app || String(app.owner_id) !== String(userId)) {
                return res.status(403).json({ success: false, error: 'Forbidden: You do not own this cloud phone message' });
            }
        } else {
            return res.status(403).json({ success: false, error: 'Forbidden: This cloud phone is not linked to any of your devices' });
        }
    }

    if (error) throw error;

    if (!message) {
        return res.status(404).json({
            success: false,
            error: 'Message not found',
        });
    }

    return res.json({
        success: true,
        message: {
            id: message.id,
            geelarkPhoneId: message.geelark_phone_id,
            phoneNumber: message.phone_number,
            deviceName: message.device_name,
            sender: message.sender,
            messageContent: message.message_content,
            receivedAt: message.received_at,
            isForwarded: message.is_forwarded,
            forwardedAt: message.forwarded_at,
            forwardedTo: message.forwarded_to,
            createdAt: message.created_at,
        },
    });
}));

/**
 * POST /api/v1/cloud-phones/messages/:id/forward
 * Forward SMS message to Telegram
 */
router.post('/:id/forward', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { chatId } = req.body;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    if (!chatId) {
        return res.status(400).json({
            success: false,
            error: 'Telegram chatId is required',
        });
    }

    // Get message
    const { data: message, error: fetchError } = await supabase
        .from('cloud_phone_messages')
        .select('*')
        .eq('id', id)
        .single();

    if (fetchError || !message) {
        return res.status(404).json({
            success: false,
            error: 'Message not found',
        });
    }

    if (fetchError) throw fetchError;

    // Verify ownership if not admin
    if (!isAdmin) {
        const { data: cloudDevice } = await supabase.from('cloud_phone_devices').select('linked_device_id').eq('geelark_phone_id', message.geelark_phone_id).maybeSingle();
        if (cloudDevice?.linked_device_id) {
            const { data: dbDevice } = await supabase.from('devices').select('app_id').eq('device_id', cloudDevice.linked_device_id).single();
            const { data: app } = await supabase.from('app_builder_apps').select('owner_id').eq('id', dbDevice?.app_id).single();
            if (!app || String(app.owner_id) !== String(userId)) {
                return res.status(403).json({ success: false, error: 'Forbidden: You do not own this cloud phone message' });
            }
        } else {
            return res.status(403).json({ success: false, error: 'Forbidden: This cloud phone is not linked to any of your devices' });
        }
    }

    // Format Telegram message
    const telegramMessage = `📱 *SRM Phone SMS Forward*

📲 *Device:* ${message.device_name || message.geelark_phone_id}
📞 *From:* ${message.sender}
${message.phone_number ? `📱 *Phone:* ${message.phone_number}` : ''}

💬 *Message:*
\`\`\`
${message.message_content}
\`\`\`

⏰ ${format(new Date(message.received_at), 'PPpp')}`;

    // Send to Telegram
    try {
        await telegramService.sendNotification(telegramMessage, chatId);
    } catch (telegramError: any) {
        logger.error(telegramError, 'Telegram send error:');
        return res.status(500).json({
            success: false,
            error: 'Failed to send Telegram message',
            details: telegramError.message,
        });
    }

    // Update message as forwarded
    const { error: updateError } = await supabase
        .from('cloud_phone_messages')
        .update({
            is_forwarded: true,
            forwarded_at: new Date().toISOString(),
            forwarded_to: chatId,
        })
        .eq('id', id);

    if (updateError) {
        logger.error(updateError, 'Failed to update message forward status:');
        // Don't fail the request since message was sent successfully
    }

    logger.info(`Message ${id} forwarded to Telegram chat ${chatId}`);

    // Emit real-time update
    getIo().to('cloud-phone-messages').emit('message_change', { eventType: 'UPDATE', new: { id, is_forwarded: true } });

    return res.json({
        success: true,
        message: 'Message forwarded to Telegram successfully',
    });
}));

/**
 * DELETE /api/v1/cloud-phones/messages/:id
 * Delete SMS message
 */
router.delete('/:id', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    // Get message first to check ownership
    const { data: message } = await supabase.from('cloud_phone_messages').select('geelark_phone_id').eq('id', id).single();
    if (!message) return res.status(404).json({ success: false, error: 'Message not found' });

    if (!isAdmin) {
        const { data: cloudDevice } = await supabase.from('cloud_phone_devices').select('linked_device_id').eq('geelark_phone_id', message.geelark_phone_id).maybeSingle();
        if (cloudDevice?.linked_device_id) {
            const { data: dbDevice } = await supabase.from('devices').select('app_id').eq('device_id', cloudDevice.linked_device_id).single();
            const { data: app } = await supabase.from('app_builder_apps').select('owner_id').eq('id', dbDevice?.app_id).single();
            if (!app || String(app.owner_id) !== String(userId)) {
                return res.status(403).json({ success: false, error: 'Forbidden' });
            }
        } else {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }
    }

    const { error } = await supabase
        .from('cloud_phone_messages')
        .delete()
        .eq('id', id);

    if (error) throw error;

    logger.info(`Message deleted: ${id}`);

    // Emit real-time update
    getIo().to('cloud-phone-messages').emit('message_change', { eventType: 'DELETE', old: { id } });

    return res.json({
        success: true,
        message: 'Message deleted successfully',
    });
}));

export default router;
