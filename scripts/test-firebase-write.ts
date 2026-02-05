import { FirebaseService } from '../src/providers/../services/firebase.service';
import config from '../src/config/env';

async function testWrite() {
    const service = new FirebaseService();
    const dbUrl = 'https://common-4d28f-default-rtdb.asia-southeast1.firebasedatabase.app';
    const path = 'test_connection';
    const data = {
        connected_at: new Date().toISOString(),
        test: true
    };

    console.log(`Testing write to ${dbUrl}/${path}.json`);
    try {
        const result = await service.write(dbUrl, path, data);
        console.log('Write Success:', result);
    } catch (err: any) {
        console.error('Write Failed:', err.message);
        if (err.response) {
            console.error('Status:', err.response.status);
            console.error('Data:', JSON.stringify(err.response.data));
        }
    }
}

testWrite();
