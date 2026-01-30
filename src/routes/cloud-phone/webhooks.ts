import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { asyncHandler } from '../../middleware/errorHandler';
import config from '../../config/env';
import logger from '../../utils/logger';
import { io } from '../../index';

const router = Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

interface GeeLarkSMSWebhook {
    phoneId: string;
    phoneNumber?: string;
    serialName?: string;
    sms: {
        sender: string;
        content: string;
        timestamp: number;
    };
}

/**
 * POST /api/v1/cloud-phones/webhooks/geelark
 * Handle GeeLark SMS webhook
 */
router.post('/geelark', asyncHandler(async (req: Request, res: Response) => {
    const payload: GeeLarkSMSWebhook = req.body;
    logger.info("Received GeeLark webhook:", JSON.stringify(payload));

    if (!payload.sms) {
        return res.status(400).json({ error: "Invalid webhook payload - missing SMS data" });
    }

    const { phoneId, phoneNumber, serialName, sms } = payload;

    // Store the SMS in cloud_phone_messages table
    const { data: newMsg, error: insertError } = await supabase
        .from("cloud_phone_messages")
        .insert({
            geelark_phone_id: phoneId,
            phone_number: phoneNumber,
            device_name: serialName,
            sender: sms.sender,
            message_content: sms.content,
            received_at: new Date(sms.timestamp * 1000).toISOString(),
        })
        .select()
        .single();

    if (insertError) {
        logger.error("Failed to insert GeeLark SMS:", insertError);
    } else if (newMsg) {
        // Emit Socket.IO event for real-time update
        io.to('cloud-phone-messages').emit('message_change', { eventType: 'INSERT', new: newMsg });
        logger.info(`Emitted Socket.IO message_change for cloud-phone-messages, device: ${phoneId}`);
    }

    // Auto-forward logic - implementation similar to edge function
    try {
        const { data: configs } = await supabase
            .from("cloud_phone_config")
            .select("*, user_profiles(telegram_chat_id)")
            .eq("auto_forward_enabled", true);

        if (configs && configs.length > 0) {
            for (const conf of configs) {
                // Check keyword filters
                const keywords = (conf.filter_keywords as string[]) || [];
                const messageContent = sms.content.toLowerCase();
                const matchesKeyword = keywords.length === 0 ||
                    keywords.some((kw: string) => messageContent.includes(kw.toLowerCase()));

                // Check amount threshold
                const amountMatch = sms.content.match(/(?:Rs\.?|₹|INR)\s*([\d,]+(?:\.\d{2})?)/i);
                const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, "")) : 0;
                const meetsThreshold = amount >= (conf.amount_threshold || 0);

                if (matchesKeyword && meetsThreshold) {
                    const chatId = conf.telegram_chat_id ||
                        (conf.user_profiles as any)?.telegram_chat_id;

                    if (chatId && config.telegram.botToken) {
                        // Format message for Telegram
                        const telegramMessage = `📱 *Cloud Phone SMS*

📲 *Device:* ${serialName || phoneId}
📞 *From:* ${sms.sender}
${phoneNumber ? `📱 *Phone:* ${phoneNumber}` : ""}
${amount > 0 ? `💰 *Amount:* ₹${amount.toLocaleString()}` : ""}

💬 *Message:*
\`\`\`
${sms.content}
\`\`\`

⏰ ${new Date(sms.timestamp * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`;

                        // Send to Telegram using fetch (or a service if available)
                        await fetch(
                            `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`,
                            {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    chat_id: chatId,
                                    text: telegramMessage,
                                    parse_mode: "Markdown",
                                }),
                            }
                        );
                        logger.info(`Auto-forwarded SMS to Telegram chat ${chatId}`);
                    }
                }
            }
        }
    } catch (err: any) {
        logger.error("Auto-forward processing error:", err.message);
    }

    return res.json({ success: true, message: "Webhook processed" });
}));

export default router;
