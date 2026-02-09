const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function enableHighScale() {
    console.log('🚀 Activating HIGH-SCALE MODE via Backend Prisma...');

    try {
        const configKey = 'system_status_config';
        const highScaleConfig = {
            mqttEnabled: true,
            relayEnabled: true,
            staleCheckEnabled: true,
            firebaseUniversalEnabled: true,
            highScaleMode: true
        };

        const result = await prisma.global_config.upsert({
            where: { config_key: configKey },
            update: { config_value: highScaleConfig },
            create: {
                config_key: configKey,
                config_value: highScaleConfig
            }
        });

        console.log('✅ High-Scale Mode is now ENABLED.');
        console.log('⚡ All telemetry will now be handled via Redis/Socket.IO only, bypassing the Database for speed.');
    } catch (error) {
        console.error('❌ Error updating config:', error);
    } finally {
        await prisma.$disconnect();
    }
}

enableHighScale();
