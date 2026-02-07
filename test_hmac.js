const crypto = require('crypto');
const axios = require('axios');

const SECRET = 'srm-mobile-default-key-12345';
const BASE_URL = 'http://localhost:3000/api/v1/mobile';
const DEVICE_ID = 'TEST_HMAC_DEVICE';

async function testHmac() {
    console.log('🚀 Starting HMAC Verification test...');

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(8).toString('hex');
    const message = `${timestamp}.${nonce}.${DEVICE_ID}`;
    const signature = crypto.createHmac('sha256', SECRET).update(message).digest('hex');

    console.log(`📡 Sending request with signature: ${signature}`);

    try {
        const response = await axios.get(`${BASE_URL}/mqtt-auth/${DEVICE_ID}`, {
            headers: {
                'x-timestamp': timestamp,
                'x-nonce': nonce,
                'x-signature': signature,
                'x-device-id': DEVICE_ID
            }
        });

        console.log('✅ Success: Request with valid HMAC accepted.');
        console.log('Response:', JSON.stringify(response.data));
    } catch (err) {
        console.error('🔴 Error: Valid HMAC request rejected.', err.response ? err.response.data : err.message);
        process.exit(1);
    }

    // Test 2: Invalid signature
    console.log('\n📡 Sending request with INVALID signature...');
    try {
        await axios.get(`${BASE_URL}/mqtt-auth/${DEVICE_ID}`, {
            headers: {
                'x-timestamp': timestamp,
                'x-nonce': nonce,
                'x-signature': 'wrong-signature',
                'x-device-id': DEVICE_ID
            }
        });
        console.error('🔴 Error: Request with INVALID HMAC was accepted! Security failed.');
        process.exit(1);
    } catch (err) {
        console.log('✅ Success: Invalid HMAC request rejected as expected.');
    }

    // Test 3: Expired timestamp
    console.log('\n📡 Sending request with EXPIRED timestamp...');
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString();
    const oldMessage = `${oldTimestamp}.${nonce}.${DEVICE_ID}`;
    const oldSignature = crypto.createHmac('sha256', SECRET).update(oldMessage).digest('hex');

    try {
        await axios.get(`${BASE_URL}/mqtt-auth/${DEVICE_ID}`, {
            headers: {
                'x-timestamp': oldTimestamp,
                'x-nonce': nonce,
                'x-signature': oldSignature,
                'x-device-id': DEVICE_ID
            }
        });
        console.error('🔴 Error: Request with EXPIRED timestamp was accepted! Replay protection failed.');
        process.exit(1);
    } catch (err) {
        console.log('✅ Success: Expired timestamp request rejected as expected.');
    }

    console.log('\n🏁 HMAC verification testing PASSED.');
}

testHmac();
