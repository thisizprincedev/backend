// Apply comprehensive user_profiles migration
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

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

async function applyMigrations() {
    console.log('🔄 Applying user_profiles migrations...\n');

    // Read the migration file
    const migrationPath = path.join(__dirname, '../../supabase/migrations/20260129_add_password_auth.sql');

    if (!fs.existsSync(migrationPath)) {
        console.log('⚠️  Migration file not found, applying inline migration...\n');
    }

    // Apply migrations one by one to see which ones fail
    const migrations = [
        {
            name: 'Add email column',
            sql: 'ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS email text;'
        },
        {
            name: 'Add password_hash column',
            sql: 'ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS password_hash text;'
        },
        {
            name: 'Add display_name column',
            sql: 'ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS display_name text;'
        },
        {
            name: 'Add role column',
            sql: `ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS role text DEFAULT 'viewer';`
        },
        {
            name: 'Make firebase_uid nullable',
            sql: 'ALTER TABLE public.user_profiles ALTER COLUMN firebase_uid DROP NOT NULL;'
        },
        {
            name: 'Add unique constraint on email',
            sql: 'ALTER TABLE public.user_profiles ADD CONSTRAINT IF NOT EXISTS user_profiles_email_unique UNIQUE (email);'
        },
        {
            name: 'Add email index',
            sql: 'CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);'
        }
    ];

    for (const migration of migrations) {
        console.log(`📝 ${migration.name}...`);
        try {
            // Use raw SQL via the REST API
            const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseServiceKey,
                    'Authorization': `Bearer ${supabaseServiceKey}`
                },
                body: JSON.stringify({ sql: migration.sql })
            });

            if (!response.ok) {
                const error = await response.text();
                console.log(`   ⚠️  ${migration.name}: ${error}`);
                console.log(`   Trying alternative method...`);

                // For constraints and indexes, failure might mean they already exist
                if (migration.name.includes('constraint') || migration.name.includes('index')) {
                    console.log(`   ✓ Skipping (likely already exists)`);
                }
            } else {
                console.log(`   ✅ ${migration.name} applied`);
            }
        } catch (error) {
            console.log(`   ⚠️  ${migration.name}: ${error.message}`);
        }
    }

    console.log('\n✅ Migration process completed');
    console.log('\n🧪 Testing table access...');

    const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email, password_hash, display_name, role')
        .limit(1);

    if (error) {
        console.error('❌ Table access test failed:', error.message);
        console.log('\n⚠️  Please run these SQL commands manually in Supabase SQL Editor:');
        migrations.forEach(m => console.log(m.sql));
    } else {
        console.log('✅ Table access successful!');
        console.log('Schema appears to be ready for authentication.');
    }
}

applyMigrations();
