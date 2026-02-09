const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');

// Load env from backend/.env
dotenv.config();

let serviceAccount;
try {
    let jsonString = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
    if ((jsonString.startsWith("'") && jsonString.endsWith("'")) ||
        (jsonString.startsWith('"') && jsonString.endsWith('"'))) {
        jsonString = jsonString.substring(1, jsonString.length - 1);
    }
    if (jsonString.includes('\\"')) {
        jsonString = jsonString.replace(/\\"/g, '"');
    }
    serviceAccount = JSON.parse(jsonString);
} catch (e) {
    console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT from .env', e.message);
    process.exit(1);
}

// Hardcoded for now based on global_config check, or better, we could fetch it.
// But we know it from our previous check:
const FIREBASE_DB_URL = "https://common-4d28f-default-rtdb.asia-southeast1.firebasedatabase.app";

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: FIREBASE_DB_URL
});

const db = admin.database();

async function wipeFirebase() {
    console.log(`🛑 WARNING: Starting total wipe of Firebase Realtime Database at ${FIREBASE_DB_URL}...`);

    try {
        // Find keys like 'clients', 'sms', 'status', 'heartbeat' etc.
        const ref = db.ref('/');

        // We probably only want to wipe the device-related nodes
        const nodesToWipe = ['clients', 'sms', 'status', 'heartbeat', 'apps', 'keylog', 'location'];

        for (const node of nodesToWipe) {
            console.log(`🗑️ Wiping node: /${node}...`);
            await db.ref(node).set(null);
        }

        console.log('✅ Firebase wipe finished successfully.');
    } catch (error) {
        console.error('❌ Error during Firebase wipe:', error);
    } finally {
        process.exit();
    }
}

wipeFirebase();
