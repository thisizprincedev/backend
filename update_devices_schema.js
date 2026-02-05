const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        await prisma.$executeRaw`ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS note text;`;
        console.log('Added note column to devices');
        await prisma.$executeRaw`ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS is_bookmarked boolean DEFAULT false;`;
        console.log('Added is_bookmarked column to devices');
    } catch (error) {
        console.error('Error updating schema:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
