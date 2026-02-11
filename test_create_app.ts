import jwt from 'jsonwebtoken';
import axios from 'axios';
import dotenv from 'dotenv';
import util from 'util';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';
const API_URL = 'http://localhost:3000/api/v1';

// Test Data
const userId = '12';
const userEmail = 'testuser@example.com';
const userRole = 'admin';

async function testCreateApp() {
    console.log('--- Starting App Creation and Auto-Build Test ---');

    // Generate token
    const token = jwt.sign(
        {
            id: userId,
            email: userEmail,
            role: userRole,
            uuid: 'test_user_1769714916857'
        },
        JWT_SECRET,
        { expiresIn: '1h' }
    );

    console.log('Generated Token for User:', userId);

    const createUrl = `${API_URL}/app-builder/apps`;
    const logsUrl = `${API_URL}/app-builder/apps/system-logs`;

    const appName = `Test App ${Date.now()}`;
    const payload = {
        appName: appName,
        packageName: 'com.test.auto.build',
        version: 'v1.0.0',
        dbProviderType: 'SUPABASE',
        universalRealtime: false,
        config: {
            supabase_url: 'https://test.supabase.co',
            supabase_anon_key: 'test-key'
        }
    };

    try {
        console.log('1. Creating app:', appName);
        const createRes = await axios.post(createUrl, payload, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const appId = createRes.data.appId;
        console.log('SUCCESS: App created with ID:', appId);

        console.log('\nWaiting 10 seconds for auto-build to trigger and propagate...');
        await new Promise(resolve => setTimeout(resolve, 10000));

        console.log('\n2. Fetching system logs to verify auto-build trace...');
        const logsRes = await axios.get(logsUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        console.log('SUCCESS: Fetched logs. Recent entries (all fields):');
        const logs = logsRes.data.logs.slice(0, 30);

        // Find logs related to the new appId
        const relevantLogs = logs.filter((l: any) =>
            l.appId === appId || (l.message && l.message.includes(appId)) || (l.meta && l.meta.app_id === appId)
        );

        if (relevantLogs.length === 0) {
            console.log('No logs found for appId:', appId, '. Auto-build might have failed to trigger.');
        }

        logs.forEach((log: any) => {
            const { timestamp, level, message, ...meta } = log;
            const isRelevant = log.appId === appId || (message && message.includes(appId)) || (meta && meta.app_id === appId);

            if (isRelevant || message.includes('dispatch') || message.includes('GitHub')) {
                console.log(`[${timestamp}] ${level}: ${message} ${isRelevant ? '<<< RELEVANT' : ''}`);
                console.log('   Meta:', util.inspect(meta, { depth: 3, colors: true, compact: true }));
            }
        });

    } catch (error: any) {
        console.error('FAILED:', error.response?.status, error.response?.data || error.message);
    }
}

testCreateApp();
