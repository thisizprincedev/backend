import { triggerGitHubBuild } from '../src/routes/app-builder/apps';
import { PrismaClient } from '@prisma/client';
import logger from '../src/utils/logger';

const prisma = new PrismaClient();

async function testTrigger() {
    const appId = '88054761-e388-48eb-abc7-534d53c8df63'; // The Firebase app
    const userId = 'dd9ff021-b47e-98f6-8c4d-53c7ca677928'; // A valid user ID (I should check this)

    // Let's find first user
    const user = await prisma.users.findFirst();
    if (!user) {
        console.error('No user found');
        return;
    }

    console.log(`--- Triggering Build for App: ${appId} (User: ${user.id}) ---`);

    try {
        // We mock the trigger call. Note: This will actually try to call GitHub if config is present.
        // But the main goal is to see if encrypted_config is updated.
        await triggerGitHubBuild(appId, user.id);
        console.log('Build triggered (or failed at GitHub step, which is fine for this test)');
    } catch (err: any) {
        console.log('Expected trigger failure (GitHub config might be missing):', err.message);
    }

    // Now check if encrypted_config is no longer empty
    const { createClient } = await import('@supabase/supabase-js');
    const config = (await import('../src/config/env')).default;
    const { encryptionService } = await import('../src/services/encryption.service');

    const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);
    const { data: app } = await supabase.from('app_builder_apps').select('encrypted_config').eq('id', appId).single();

    if (app?.encrypted_config) {
        const decrypted = encryptionService.decrypt(app.encrypted_config);
        console.log('Decrypted Config AFTER Trigger:', JSON.stringify(decrypted, null, 2));
    } else {
        console.error('Encrypted config is still null!');
    }
}

testTrigger();
