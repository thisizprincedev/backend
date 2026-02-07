import { createClient } from '@supabase/supabase-js';
import config from './config/env';
import { ProviderFactory } from './providers/factory';
import axios from 'axios';

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

async function verifyPermissions() {
    console.log('--- Starting Permission Verification ---');

    // 1. Verify SocketIOProviderServer Security
    console.log('\n1. Verifying SocketIOProviderServer Security:');
    try {
        // Use port 3001 as configured in .env
        const dummyUrl = 'http://localhost:3001/api/devices';
        await axios.get(dummyUrl);
        console.error('❌ FAIL: SocketIOProviderServer allowed unauthorized request');
    } catch (error: any) {
        if (error.response?.status === 401 || error.response?.status === 403) {
            console.log('✅ PASS: SocketIOProviderServer rejected unauthorized request');
        } else {
            console.warn(`⚠️ NOTE: SocketIOProviderServer might not be running or reachable on port 3001 (${error.message})`);
        }
    }

    // 2. Verify getProviderForUser logic
    console.log('\n2. Verifying getProviderForUser Logic:');

    // Find an app and its owner
    const { data: testApp } = await supabase.from('app_builder_apps').select('id, owner_id').limit(1).single();
    if (!testApp) {
        console.error('❌ FAIL: No apps found in database for testing');
        return;
    }

    // Find the profile for this owner
    let testUser: any = null;
    const { data: userByUuid } = await supabase.from('user_profiles').select('id, supabase_user_id').eq('supabase_user_id', testApp.owner_id).maybeSingle();
    if (userByUuid) {
        testUser = userByUuid;
    } else {
        const { data: userById } = await supabase.from('user_profiles').select('id, supabase_user_id').eq('id', testApp.owner_id).maybeSingle();
        if (userById) {
            testUser = userById;
        }
    }

    if (!testUser) {
        console.error(`❌ FAIL: Profile for owner ${testApp.owner_id} not found`);
        return;
    }

    console.log(`Found Test User: ${testUser.id} (Owner of App: ${testApp.id})`);

    const { data: device } = await supabase.from('devices').select('device_id').eq('app_id', testApp.id).limit(1).maybeSingle();
    if (!device) {
        console.log(`⚠️ SKIP: No devices found for app ${testApp.id}, cannot test ownership logic fully`);
    } else {
        // Test legitimate access
        const provider = await ProviderFactory.getProviderForUser(device.device_id, testUser.id, testApp.id);
        if (provider) {
            console.log(`✅ PASS: User ${testUser.id} allowed access to their own device ${device.device_id}`);
        } else {
            console.error(`❌ FAIL: User ${testUser.id} denied access to their own device ${device.device_id}`);
        }

        // Test unauthorized access (pick another user's device if available)
        const { data: otherDevice } = await supabase.from('devices').select('device_id').neq('app_id', testApp.id).limit(1).maybeSingle();
        if (otherDevice) {
            const forbiddenProvider = await ProviderFactory.getProviderForUser(otherDevice.device_id, testUser.id);
            if (!forbiddenProvider) {
                console.log(`✅ PASS: User ${testUser.id} denied access to other's device ${otherDevice.device_id}`);
            } else {
                console.error(`❌ FAIL: User ${testUser.id} ALLOWED access to other's device ${otherDevice.device_id}`);
            }
        }
    }

    console.log('\n--- Verification Complete ---');
}

verifyPermissions().catch(err => {
    console.error('Verification script failed:', err);
    process.exit(1);
});
