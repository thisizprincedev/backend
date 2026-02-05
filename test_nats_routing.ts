import { connect, JSONCodec } from 'nats';

async function test() {
    const nc = await connect({
        servers: 'nats://139.84.142.70:4222',
        user: 'srm_backend',
        pass: 'strong_password_123'
    });
    const jc = JSONCodec();

    console.log('📡 NATS Listener started on devices.>');

    const sub = nc.subscribe('devices.>');
    (async () => {
        for await (const m of sub) {
            console.log(`[NATS RECV] Subject: ${m.subject}, Payload: ${new TextDecoder().decode(m.data)}`);
        }
    })();
}

test().catch(console.error);
