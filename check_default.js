import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkDefault() {
    console.log('Checking id column default value...');
    const { data, error } = await supabase.rpc('get_column_default', { t_name: 'sms_messages', c_name: 'id' });

    if (error) {
        console.error('RPC Error:', error.message);
        // Fallback: try to insert without ID and see if it works, or check pg_attribute
        const { data: cols, error: err2 } = await supabase.from('sms_messages').select('*').limit(0);
        console.log('Could select?', !!cols);
    } else {
        console.log('Default value:', data);
    }
}

checkDefault();
