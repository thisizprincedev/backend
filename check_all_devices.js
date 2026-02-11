const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAllDevices() {
    console.log('\n--- All Devices in Database ---');
    try {
        const { data: devices, error } = await supabase
            .from('devices')
            .select('device_id, app_id, model, status, last_seen')
            .order('last_seen', { ascending: false });

        if (error) throw error;

        devices.forEach(d => {
            console.log(`ID: ${d.device_id}, App: ${d.app_id}, Model: ${d.model}, Online: ${d.status}, Last Seen: ${d.last_seen}`);
        });

    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        console.log('\n--- Check Complete ---\n');
    }
}

checkAllDevices();
