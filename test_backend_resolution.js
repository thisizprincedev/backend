const { ProviderFactory } = require('./dist/providers/factory');
require('dotenv').config();

async function testRoute() {
    const appId = '1aa9b800-370d-4152-b21d-ef302e5cdb6c';
    console.log(`🔍 Resolving provider for appId: ${appId}`);

    try {
        const provider = await ProviderFactory.getProvider(appId);
        console.log(`✅ Resolved provider: ${provider.constructor.name}`);

        console.log('📡 Listing devices...');
        const devices = await provider.listDevices();
        console.log(`✅ Found ${devices.length} devices.`);
        console.log(JSON.stringify(devices, null, 2));
    } catch (e) {
        console.error('❌ Error:', e.message);
    }
}

testRoute();
