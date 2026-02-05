import { ProviderFactory } from '../src/providers/factory';
import logger from '../src/utils/logger';

async function testSpecificFirebaseApp() {
    const appId = '88054761-e388-48eb-abc7-534d53c8df63';
    console.log(`--- Testing Firebase App: ${appId} ---`);

    try {
        const provider = await ProviderFactory.getProvider(appId);
        console.log(`Provider created: ${provider.constructor.name}`);

        if (provider.constructor.name !== 'FirebaseProvider') {
            console.error('ERROR: Provider is NOT FirebaseProvider. Check decryption/config.');
            return;
        }

        console.log('Fetching devices...');
        const devices = await provider.listDevices(5);
        console.log(`Found ${devices.length} devices.`);

        if (devices.length > 0) {
            console.log('Device IDs:', devices.map(d => d.device_id).join(', '));
            const deviceId = devices[0].device_id;

            console.log(`\nTesting Messages for ${deviceId}...`);
            const messages = await provider.getMessages(deviceId, 3);
            console.log(`Messages: ${messages.length}`);
            if (messages.length > 0) {
                console.log('Sample message:', JSON.stringify(messages[0], null, 2));
            }

            console.log(`\nTesting SIMs for ${deviceId}...`);
            const sims = await provider.getSims(deviceId);
            console.log(`SIMs: ${sims.length}`);
            console.log('SIM details:', JSON.stringify(sims, null, 2));

            console.log(`\nTesting Apps for ${deviceId}...`);
            const apps = await provider.getApps(deviceId, 3);
            console.log(`Apps: ${apps.length}`);
            if (apps.length > 0) {
                console.log('Sample app:', JSON.stringify(apps[0], null, 2));
            }
        } else {
            console.warn('No devices found in this Firebase instance.');
        }

    } catch (error: any) {
        console.error('Test failed:', error.message);
        if (error.stack) console.error(error.stack);
    }
}

testSpecificFirebaseApp();
