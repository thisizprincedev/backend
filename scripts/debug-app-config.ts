import { PrismaClient } from '@prisma/client';
import { encryptionService } from '../src/services/encryption.service';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function debugAppConfig() {
    const appId = '88054761-e388-48eb-abc7-534d53c8df63';
    console.log(`--- Debugging App Config: ${appId} ---`);

    try {
        const app = await prisma.app_builder_apps.findUnique({
            where: { id: appId }
        });

        if (!app) {
            console.error('App not found');
            return;
        }

        console.log('Raw Encrypted Config:', app.encrypted_config);

        if (app.encrypted_config) {
            try {
                const decrypted = encryptionService.decrypt(app.encrypted_config);
                console.log('Decrypted Config:', JSON.stringify(decrypted, null, 2));
            } catch (err: any) {
                console.error('Decryption failed:', err.message);
            }
        } else {
            console.warn('Encrypted config is NULL or empty.');
        }

        console.log('\nChecking Database Provider ID:', app.database_provider_id);
        if (app.database_provider_id) {
            const provider = await prisma.database_providers.findUnique({
                where: { id: app.database_provider_id }
            });
            console.log('Linked Provider:', JSON.stringify(provider, null, 2));
        }

    } catch (error: any) {
        console.error('Debug failed:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

debugAppConfig();
