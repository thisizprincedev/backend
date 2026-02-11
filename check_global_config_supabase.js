const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkGlobalConfig() {
    console.log('\n--- Supabase Global Configuration Check ---');
    try {
        const { data: configs, error } = await supabase
            .from('global_config')
            .select('*')
            .in('config_key', ['app_builder_db_provider_config', 'app_builder_universal_firebase_config']);

        if (error) throw error;

        configs.forEach(config => {
            console.log(`\nKey: ${config.config_key}`);
            console.log('Value:', JSON.stringify(config.config_value, null, 2));
        });

    } catch (err) {
        console.error('❌ Error querying Supabase:', err.message);
    } finally {
        console.log('\n--- Check Complete ---\n');
    }
}

checkGlobalConfig();
