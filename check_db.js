import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectTable() {
    console.log('Final Verification: Attempting to insert a numeric BigInt into user_id...');
    // We use a dummy user ID that is likely to exist or just a number if FK is deferred/disabled
    // But since the query cleared the table, any number should work if FK matches.
    // User 12 was seen in logs.
    const { error } = await supabase.from('user_filter_preferences').insert({
        user_id: 12,
        preference_type: 'device_filters_verified',
        preferences: { verified: true }
    });

    if (error) {
        console.log('Insert failed:', error.message);
        if (error.message.includes('type uuid')) {
            console.log('FAILURE: user_id is still UUID.');
        } else {
            console.log('ERROR (could be FK):', error.message);
        }
    } else {
        console.log('SUCCESS: user_id is definitely BIGINT now!');
    }
}

inspectTable();
