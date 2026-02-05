import { PrismaClient } from '@prisma/client';
import { FirebaseProvider } from '../src/providers/firebase.provider';
import logger from '../src/utils/logger';

const prisma = new PrismaClient();

async function checkFirebaseData() {
    console.log('--- Checking Firebase Data Connectivity ---');

    try {
        // 1. Get all active Firebase databases
        const dbs = await prisma.firebase_databases.findMany({
            where: { is_active: true }
        });

        if (dbs.length === 0) {
            console.error('No active Firebase databases found in DB.');
            return;
        }

        console.log(`Found ${dbs.length} active Firebase databases.`);

        for (const db of dbs) {
            console.log(`\nTesting Database: ${db.name} (${db.database_url})`);
            const provider = new FirebaseProvider(db.database_url);

            try {
                // Try listing devices
                console.log('Fetching devices...');
                const devices = await provider.listDevices(3);
                console.log(`Successfully fetched ${devices.length} devices.`);

                if (devices.length > 0) {
                    const deviceId = devices[0].device_id;
                    console.log(`Device ID: ${deviceId}`);

                    // Try fetching messages
                    const messages = await provider.getMessages(deviceId, 3);
                    console.log(`Messages: ${messages.length} found.`);

                    // Try fetching sims
                    const sims = await provider.getSims(deviceId);
                    console.log(`SIM Cards: ${sims.length} found.`);
                }
            } catch (err: any) {
                console.error(`Error fetching from ${db.name}:`, err.message);
                if (err.response) {
                    console.error('Response:', err.response.status, err.response.data);
                }
            }
        }

    } catch (error: any) {
        console.error('Check failed:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkFirebaseData();
