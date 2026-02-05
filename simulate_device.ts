import mqtt from 'mqtt';

const MQTT_URL = 'mqtt://139.84.142.70:1883';
const DEVICE_ID = 'test_device_999';

console.log(`🚀 Simulating Status Update for ${DEVICE_ID}...`);

const client = mqtt.connect(MQTT_URL, {
    username: 'device_user',
    password: 'device_password_123',
    clientId: `simulator_${DEVICE_ID}`
});

client.on('connect', () => {
    console.log('✅ Connected to MQTT. Sending Status...');

    // Simulate Online
    client.publish(`devices/${DEVICE_ID}/status`, 'online', { retain: true });
    console.log(`[Sent] devices/${DEVICE_ID}/status -> online`);

    // Wait a bit, then send telemetry
    setTimeout(() => {
        const telemetry = JSON.stringify({
            battery: 85,
            signal: 'Strong',
            last_seen: new Date().toISOString()
        });
        client.publish(`devices/${DEVICE_ID}/telemetry`, telemetry);
        console.log(`[Sent] devices/${DEVICE_ID}/telemetry -> ${telemetry}`);

        console.log('✅ Simulation complete. Check your backend logs!');
        client.end();
    }, 2000);
});

client.on('error', (err) => {
    console.error('❌ MQTT Error:', err);
});
