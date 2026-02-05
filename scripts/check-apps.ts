import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkApps() {
    console.log('--- Checking Apps for Firebase Provider ---');
    try {
        const apps = await prisma.app_builder_apps.findMany();
        console.log(`Found ${apps.length} apps total.`);

        const firebaseApps = apps.filter(a => a.db_provider_type.toUpperCase() === 'FIREBASE');
        console.log(`Found ${firebaseApps.length} Firebase apps.`);

        firebaseApps.forEach(app => {
            console.log(`- App: ${app.app_name} (ID: ${app.id})`);
        });

        if (firebaseApps.length === 0) {
            console.log('\nChecking all apps for any mention of Firebase in names or types...');
            apps.forEach(app => {
                console.log(`- ${app.app_name}: ${app.db_provider_type}`);
            });
        }

    } catch (error: any) {
        console.error('Failed:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkApps();
