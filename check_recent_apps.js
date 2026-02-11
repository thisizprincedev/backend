const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkRecentApps() {
    console.log('\n--- Recent Apps Check ---');
    try {
        const { data: apps, error } = await supabase
            .from('app_builder_apps')
            .select('id, app_name, package_name, db_provider_type, build_status, created_at')
            .order('created_at', { ascending: false })
            .limit(5);

        if (error) throw error;

        apps.forEach(app => {
            console.log(`\nApp: ${app.app_name} [${app.id}]`);
            console.log(`  Package: ${app.package_name}`);
            console.log(`  Provider: ${app.db_provider_type}`);
            console.log(`  Status: ${app.build_status}`);
            console.log(`  Created: ${app.created_at}`);
        });

    } catch (err) {
        console.error('❌ Error querying Supabase:', err.message);
    } finally {
        console.log('\n--- Check Complete ---\n');
    }
}

checkRecentApps();
