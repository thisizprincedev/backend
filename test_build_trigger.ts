import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function testTrigger() {
    console.log('--- Starting Build Trigger Test ---');

    // 1. Fetch Global GitHub Config
    const globalConfig = await prisma.global_config.findUnique({
        where: { config_key: 'github_workflow_config' }
    });

    if (!globalConfig) {
        console.error('ERROR: Global GitHub config not found in DB');
        return;
    }

    const githubConfig = globalConfig.config_value as any;
    console.log('GitHub Config Found:', {
        owner: githubConfig.owner,
        repo: githubConfig.repo,
        workflow: githubConfig.workflow,
        ref: githubConfig.ref,
        pat: githubConfig.pat ? '***' + githubConfig.pat.slice(-4) : 'MISSING'
    });

    // 2. Fetch a sample app (from app_builder_apps)
    const app = await prisma.app_builder_apps.findFirst();
    if (!app) {
        console.error('ERROR: No app found in app_builder_apps to test with');
        return;
    }
    console.log('Using Sample App:', {
        id: app.id,
        name: app.app_name,
        package: app.package_name,
        provider: app.db_provider_type
    });

    const workflowName = githubConfig.workflow || 'app-builder-trigger.yml';
    const ref = githubConfig.ref || 'main';
    const url = `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/actions/workflows/${workflowName}/dispatches`;

    const buildId = `test-${app.id.slice(0, 8)}-${Date.now()}`;
    const inputs = {
        app_id: app.id,
        package_name: app.package_name,
        version: app.version || 'v1.0.0',
        db_provider_type: app.db_provider_type,
        primary_realtime: 'true',
        universal_realtime: 'false',
        mqtt_enabled: 'true',
        build_id: buildId,
        mobile_api_access_key: 'test_key'
    };
    
    console.log('Dispatching to URL:', url);
    console.log('Inputs:', JSON.stringify(inputs, null, 2));

    try {
        const response = await axios.post(url, { ref: ref, inputs: inputs }, {
            headers: {
                'Authorization': `Bearer ${githubConfig.pat}`,
                'Accept': 'application/vnd.github.v3+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        console.log('SUCCESS: Build Triggered!', response.status);
    } catch (error: any) {
        console.error('FAILED: Build Trigger Error');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Message:', error.message);
        }
    }
}

testTrigger()
    .finally(async () => {
        await prisma.$disconnect();
    });
