const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkDeviceApps() {
    console.log('\n--- Device App Details ---');
    const deviceIds = ['7587ab43638ca999', '993c31a1983c33a1'];

    try {
        const { data: devices, error: dError } = await supabase
            .from('devices')
            .select('device_id, app_id, model')
            .in('device_id', deviceIds);

        if (dError) throw dError;

        for (const device of devices) {
            console.log(`\nDevice: ${device.device_id} (${device.model})`);
            console.log(`  App ID: ${device.app_id}`);

            if (device.app_id) {
                const { data: app, error: aError } = await supabase
                    .from('app_builder_apps')
                    .select('app_name, db_provider_type')
                    .eq('id', device.app_id)
                    .single();

                if (aError) {
                    console.log(`  App Info: Not found (${aError.message})`);
                } else {
                    console.log(`  App Name: ${app.app_name}`);
                    console.log(`  Provider: ${app.db_provider_type}`);
                }
            } else {
                console.log('  App ID: Missing');
            }
        }

    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        console.log('\n--- Details Complete ---\n');
    }
}

checkDeviceApps();
