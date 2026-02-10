import { SupabaseProvider } from './src/providers/supabase.provider';
import prisma from './src/lib/prisma';

async function test() {
    console.log('--- Testing SupabaseProvider Counts ---');
    const provider = new SupabaseProvider('c8aa10d4-beda-4934-84d4-0f9ac884b025');

    // Check if there are any devices at all for this app
    const devices = await provider.listDevices(10);
    console.log(`Found ${devices.length} devices.`);

    if (devices.length > 0) {
        console.log('Sample device stats:', JSON.stringify(devices[0]._count));
    } else {
        // Find ANY device with counts
        const anyKeylogs = await prisma.key_logger.findFirst();
        if (anyKeylogs) {
            console.log(`Found keylogs for device: ${anyKeylogs.device_id}`);
            const { data: dev } = await (provider as any).supabase.from('devices').select('*').eq('device_id', anyKeylogs.device_id).single();
            if (dev) {
                console.log(`Device ${anyKeylogs.device_id} exists on app ${dev.app_id}`);
                const p = new SupabaseProvider(dev.app_id);
                const results = await p.listDevices(100);
                const target = results.find(d => d.device_id === anyKeylogs.device_id);
                console.log(`Target device stats:`, JSON.stringify(target?._count));
            }
        }
    }
}

test().catch(console.error).finally(() => prisma.$disconnect());
