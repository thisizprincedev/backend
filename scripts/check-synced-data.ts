import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSyncedData() {
    console.log('--- Checking for Synced Firebase Data ---');
    try {
        const devices = await prisma.synced_devices.findMany({
            take: 5
        });
        console.log(`Found ${devices.length} synced devices.`);
        if (devices.length > 0) {
            console.log('Sample device source:', devices[0].firebase_device_id);
        }

        const messages = await prisma.synced_messages.findMany({
            take: 5
        });
        console.log(`Found ${messages.length} synced messages.`);

    } catch (error: any) {
        console.error('Failed:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkSyncedData();
