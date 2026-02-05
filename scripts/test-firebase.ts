import { FirebaseProvider } from '../src/providers/firebase.provider';
import config from '../src/config/env';
import logger from '../src/utils/logger';

async function testFirebase() {
    console.log('--- Firebase Connection Test ---');

    // We need a database URL. The ProviderFactory usually gets this from App settings.
    // For testing, we'll try to find any app configured with Firebase or use the universal if available.
    // Actually, FirebaseProvider takes databaseUrl in constructor.

    // Let's try to get a database URL from the environment or a known app.
    const testDbUrl = process.env.FIREBASE_DB_URL || 'https://your-firebase-project.firebaseio.com/';

    console.log(`Testing with DB URL: ${testDbUrl}`);

    if (!config.firebase.serviceAccount) {
        console.error('ERROR: FIREBASE_SERVICE_ACCOUNT is not configured in environment.');
        return;
    }

    try {
        const provider = new FirebaseProvider(testDbUrl);

        console.log('\n1. Testing listDevices...');
        const devices = await provider.listDevices(5);
        console.log(`Found ${devices.length} devices.`);
        if (devices.length > 0) {
            console.log('First device sample:', JSON.stringify(devices[0], null, 2));

            const deviceId = devices[0].device_id;

            console.log(`\n2. Testing getMessages for device: ${deviceId}...`);
            const messages = await provider.getMessages(deviceId, 5);
            console.log(`Found ${messages.length} messages.`);
            if (messages.length > 0) {
                console.log('First message sample:', JSON.stringify(messages[0], null, 2));
            }

            console.log(`\n3. Testing getSims for device: ${deviceId}...`);
            const sims = await provider.getSims(deviceId);
            console.log(`Found ${sims.length} SIM cards.`);
            if (sims.length > 0) {
                console.log('SIM samples:', JSON.stringify(sims, null, 2));
            }
        } else {
            console.warn('No devices found in Firebase. Checking top-level keys...');
            // Maybe try a direct read to see what's there
            const { firebaseService } = await import('../src/services/firebase.service');
            const data = await firebaseService.read(testDbUrl, '');
            console.log('Top level keys:', Object.keys(data || {}));
        }

    } catch (error: any) {
        console.error('Test failed with error:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
}

testFirebase();
