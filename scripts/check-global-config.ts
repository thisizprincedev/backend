import { createClient } from '@supabase/supabase-js';
import config from '../src/config/env';

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

async function checkGlobalConfig() {
    const { data: globalProviderRow } = await supabase
        .from('global_config')
        .select('config_value')
        .eq('config_key', 'app_builder_db_provider_config')
        .maybeSingle();

    console.log('Global Provider Config:', JSON.stringify(globalProviderRow?.config_value, null, 2));
}

checkGlobalConfig();
