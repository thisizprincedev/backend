const { encryptionService } = require('./dist/services/encryption.service');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkApp() {
    const appId = '1aa9b800-370d-4152-b21d-ef302e5cdb6c';
    const { data: app, error } = await supabase
        .from('app_builder_apps')
        .select('id, db_provider_type, encrypted_config')
        .eq('id', appId)
        .single();

    if (error) {
        console.error('Error:', error);
        return;
    }

    try {
        const config = encryptionService.decrypt(app.encrypted_config);
        console.log('Decrypted Config:', JSON.stringify(config, null, 2));
    } catch (e) {
        console.error('Decryption failed:', e.message);
    }
}

checkApp();
