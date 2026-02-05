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
        console.log(`Provider Type: ${app.db_provider_type}`);

        if (app.db_provider_type.toUpperCase() !== 'FIREBASE') {
            console.error('Not a Firebase app');
            return;
        }

        const appConfig = encryptionService.decrypt(app.encrypted_config as string) as any;
        const dbUrl = appConfig?.firebase?.databaseURL;

        if (!dbUrl) {
            console.error('Firebase Database URL not found in config');
            console.log('Config keys:', Object.keys(appConfig || {}));
            return;
        }

        console.log(`Database URL: ${dbUrl}`);
        const provider = new FirebaseProvider(dbUrl);

        console.log('\nFetching devices...');
        const devices = await provider.listDevices(5);
        console.log(`Found ${devices.length} devices.`);

        if (devices.length > 0) {
            const deviceId = devices[0].device_id;
            console.log(`\nTesting for Device ID: ${deviceId}`);

            const [msgs, sims, currentApps] = await Promise.all([
                provider.getMessages(deviceId, 3),
                provider.getSims(deviceId),
                provider.getApps(deviceId, 3)
            ]);

            console.log(`Messages found: ${msgs.length}`);
            if (msgs.length > 0) console.log('Sample message body:', msgs[0].body);

            console.log(`SIMs found: ${sims.length}`);
            if (sims.length > 0) console.log('SIM 1:', sims[0].carrier_name, '(', sims[0].phone_number, ')');

            console.log(`Apps found: ${currentApps.length}`);
            if (currentApps.length > 0) console.log('App 1:', currentApps[0].app_name);
        }

    } catch (error: any) {
        console.error('Test failed:', error.message);
        if (error.stack) console.error(error.stack);
    } finally {
        await prisma.$disconnect();
    }
}

testFirebaseDirect();
