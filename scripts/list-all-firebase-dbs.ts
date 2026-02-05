import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function listAllFirebaseDbs() {
    console.log('--- Listing All Firebase Databases ---');
    try {
        const dbs = await prisma.firebase_databases.findMany();
        console.log(`Found ${dbs.length} databases.`);
        dbs.forEach(db => {
            console.log(`- ${db.name}: ${db.database_url} (Active: ${db.is_active})`);
        });
    } catch (error: any) {
        console.error('Failed:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

listAllFirebaseDbs();
