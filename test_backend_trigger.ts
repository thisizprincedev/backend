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
const appId = 'c70a6a2e-6278-4375-ab67-dfa1dfe80af6';

async function testBackendTrigger() {
    console.log('--- Starting Backend API Trigger Test with Detailed Log Retrieval ---');

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

    const buildUrl = `${API_URL}/app-builder/apps/${appId}/build`;
    const logsUrl = `${API_URL}/app-builder/apps/system-logs`;

    try {
        console.log('1. Sending build request to:', buildUrl);
        const buildRes = await axios.post(buildUrl, {}, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        console.log('SUCCESS: Build triggered:', buildRes.status, buildRes.data);

        // Wait a bit for logs to propagate
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('\n2. Fetching system logs from:', logsUrl);
        const logsRes = await axios.get(logsUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        console.log('SUCCESS: Fetched logs. Recent entries (all fields):');
        const logs = logsRes.data.logs.slice(0, 15);
        logs.forEach((log: any) => {
            const { timestamp, level, message, ...meta } = log;
            console.log(`[${timestamp}] ${level}: ${message}`);
            if (Object.keys(meta).length > 0) {
                console.log('   Meta:', util.inspect(meta, { depth: 3, colors: true, compact: true }));
            }
        });

    } catch (error: any) {
        console.error('FAILED:', error.response?.status, error.response?.data || error.message);
    }
}

testBackendTrigger();
