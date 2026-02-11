const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config();

function decrypt(data) {
    if (!data) return {};
    if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (e) { return {}; }
    }

    if (!data || data.v !== 1 || data.alg !== 'AES-GCM') return {};

    try {
        const rawKey = process.env.APP_BUILDER_ENCRYPTION_KEY;
        const key = crypto.createHash('sha256').update(rawKey).digest();
        const iv = Buffer.from(data.iv, 'base64');
        const ct = Buffer.from(data.ct, 'base64');

        const authTag = ct.slice(-16);
        const ciphertext = ct.slice(0, -16);

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final()
        ]);

        return JSON.parse(decrypted.toString('utf8'));
    } catch (e) {
        console.error('Decryption failed:', e.message);
        return {};
    }
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAppConfig() {
    const appId = '7b6d6ccd-3f8e-4f73-a060-c4461789a221';
    console.log(`\n--- App Configuration Check [${appId}] ---`);
    try {
        const { data: app, error } = await supabase
            .from('app_builder_apps')
            .select('*')
            .eq('id', appId)
            .single();

        if (error) throw error;

        console.log(`App Name: ${app.app_name}`);
        console.log(`Provider: ${app.db_provider_type}`);

        const config = decrypt(app.encrypted_config);
        console.log('Decrypted Config:', JSON.stringify(config, null, 2));

    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        console.log('\n--- Check Complete ---\n');
    }
}

checkAppConfig();
