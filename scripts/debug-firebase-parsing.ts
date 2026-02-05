import config from '../src/config/env';

function debugConfig() {
    console.log('--- Firebase Config Debug ---');
    console.log('Firebase Service Account configured:', !!config.firebase.serviceAccount);

    if (config.firebase.serviceAccount) {
        console.log('Project ID:', config.firebase.serviceAccount.project_id);
        console.log('Client Email:', config.firebase.serviceAccount.client_email);
        console.log('Private Key Start:', config.firebase.serviceAccount.private_key?.substring(0, 50));
    } else {
        console.log('RAW Value:', process.env.FIREBASE_SERVICE_ACCOUNT);
    }
}

debugConfig();
