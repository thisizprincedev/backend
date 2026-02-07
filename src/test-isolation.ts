import { ProviderFactory } from './providers/factory';
import { NullProvider } from './providers/null.provider';
import { SupabaseProvider } from './providers/supabase.provider';

async function testIsolation() {
    console.log('--- Testing Data Isolation ---');

    console.log('1. Testing getProvider() with no appId...');
    const nullProvider = await ProviderFactory.getProvider();
    console.log('Result instance:', nullProvider.constructor.name);
    if (nullProvider instanceof NullProvider) {
        console.log('✅ OK: Returns NullProvider');
    } else {
        console.log('❌ FAIL: Should return NullProvider');
    }

    const devices = await nullProvider.listDevices();
    console.log('Devices returned:', devices.length);
    if (devices.length === 0) {
        console.log('✅ OK: Returns empty array');
    } else {
        console.log('❌ FAIL: Should return empty array');
    }

    console.log('\n2. Testing getProvider("null")...');
    const p2 = await ProviderFactory.getProvider("null");
    if (p2 instanceof NullProvider) {
        console.log('✅ OK: Returns NullProvider');
    } else {
        console.log('❌ FAIL');
    }

    console.log('\n3. Testing getProvider("invalid-id")...');
    const p3 = await ProviderFactory.getProvider("00000000-0000-0000-0000-000000000000"); // UUID that likely doesn't exist
    if (p3 instanceof NullProvider) {
        console.log('✅ OK: Returns NullProvider for non-existent app');
    } else {
        console.log('❌ FAIL');
    }

    console.log('\n4. Testing SupabaseProvider isolation defense...');
    const supabaseUnassigned = new SupabaseProvider();
    const d4 = await supabaseUnassigned.listDevices();
    if (d4.length === 0) {
        console.log('✅ OK: SupabaseProvider returns empty list when unassigned');
    } else {
        console.log('❌ FAIL');
    }

    console.log('\nIsolation tests complete.');
    process.exit(0);
}

testIsolation().catch(err => {
    console.error('Test script crashed:', err);
    process.exit(1);
});
