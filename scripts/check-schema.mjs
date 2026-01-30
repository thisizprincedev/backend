// Check actual user_profiles schema in the database
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSchema() {
    console.log('🔍 Checking user_profiles table schema...\n');

    // Try to select all columns
    const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .limit(1);

    if (error) {
        console.error('❌ Error querying table:', error.message);
        console.error('Details:', error);

        // Try to get table info from information_schema
        console.log('\n📊 Attempting to query information_schema...');
        const { data: columns, error: schemaError } = await supabase
            .rpc('exec_sql', {
                sql: `
          SELECT column_name, data_type, is_nullable 
          FROM information_schema.columns 
          WHERE table_name = 'user_profiles' 
          AND table_schema = 'public'
          ORDER BY ordinal_position;
        `
            });

        if (schemaError) {
            console.error('❌ Cannot query schema:', schemaError.message);
        } else {
            console.log('✅ Table columns:', columns);
        }
    } else {
        console.log('✅ Sample row:', data);
        if (data && data.length > 0) {
            console.log('\n📋 Available columns:', Object.keys(data[0]));
        } else {
            console.log('\n⚠️  Table is empty, cannot determine columns from data');
        }
    }
}

checkSchema();
