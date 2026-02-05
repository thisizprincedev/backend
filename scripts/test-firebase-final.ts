import { PrismaClient } from '@prisma/client';
import { FirebaseProvider } from '../src/providers/firebase.provider';
import { encryptionService } from '../src/services/encryption.service';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function testFirebaseDirect() {
    const appId = '88054761-e388-48eb-abc7-534d53c8df63';
    console.log(`--- Testing Firebase App Direct: ${appId} ---`);

    try {
        const app = await prisma.app_builder_apps.findUnique({
            where: { id: appId }
        });

        if (!app) {
            console.error('App not found');
            return;
        }

        console.log(`App Name: ${app.app_name}`);

        const decrypted = encryptionService.decrypt(app.encrypted_config as any) as any;
        const dbUrl = decrypted?.firebase?.databaseURL;

        if (!dbUrl) {
            console.error('No DB URL in decrypted config');
            console.log('Decrypted:', JSON.stringify(decrypted, null, 2));
            return;
        }

        console.log(`Connecting to: ${dbUrl}`);
        const provider = new FirebaseProvider(dbUrl);

        console.log('\nFetching devices...');
        const devices = await provider.listDevices(5);
        console.log(`Found ${devices.length} devices.`);

        if (devices.length > 0) {
            console.log('Device List:', devices.map(d => `${d.model} (${d.device_id})`).join(', '));

            const deviceId = devices[0].device_id;
            console.log(`\nFetching details for ${deviceId}...`);
            const [msgs, sims] = await Promise.all([
                provider.getMessages(deviceId, 3),
                provider.getSims(deviceId)
            ]);

            console.log(`Messages: ${msgs.length}`);
            console.log(`SIM Cards: ${sims.length}`);
        } else {
            console.log('NO DEVICES FOUND in this Firebase instance.');
        }

    } catch (error: any) {
        console.error('Test failed:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

testFirebaseDirect();
