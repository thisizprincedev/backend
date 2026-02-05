import dotenv from 'dotenv';
import { google } from 'googleapis';
import crypto from 'crypto';

dotenv.config();

function toHex(buffer: Buffer) {
    return buffer.toString('hex').match(/.{1,2}/g)?.join(' ') || '';
}

async function diagnose() {
    console.log('--- Firebase Deep Diagnostic ---');
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) return;

    // Scan for non-printable characters
    console.log('Scanning for non-printable characters in raw env...');
    for (let i = 0; i < raw.length; i++) {
        const code = raw.charCodeAt(i);
        if (code < 32 && code !== 10 && code !== 13 && code !== 9) {
            console.warn(`Found non-printable char at index ${i}: code ${code}`);
        }
    }

    try {
        let jsonString = raw.trim();
        if ((jsonString.startsWith("'") && jsonString.endsWith("'")) ||
            (jsonString.startsWith('"') && jsonString.endsWith('"'))) {
            jsonString = jsonString.substring(1, jsonString.length - 1);
        }
        if (jsonString.includes('\\"')) {
            jsonString = jsonString.replace(/\\"/g, '"');
        }

        const sa = JSON.parse(jsonString);
        let key = sa.private_key;

        const header = '-----BEGIN PRIVATE KEY-----';
        const footer = '-----END PRIVATE KEY-----';

        let base64Part = key
            .replace(header, '')
            .replace(footer, '')
            .replace(/\\n/g, '')
            .replace(/\n/g, '')
            .replace(/\r/g, '')
            .trim();

        console.log('Base64 Part Length:', base64Part.length);
        console.log('Base64 Part End:', base64Part.substring(base64Part.length - 20));
        console.log('Base64 Part End Codes:', Array.from(base64Part.substring(base64Part.length - 20)).map(c => c.charCodeAt(0)));

        if (base64Part.length % 4 !== 0) {
            console.warn(`WARNING: Base64 length is ${base64Part.length}, which is not a multiple of 4. This key is likely TRUNCATED.`);
        }

        // Manual OID check
        const buffer = Buffer.from(base64Part, 'base64');
        console.log('DER Header (first 30 bytes):', toHex(buffer.slice(0, 30)));

        // PKCS#8 prefix for RSA: 30 82 .. .. 02 01 00 30 0d 06 09 2a 86 48 86 f7 0d 01 01 01 05 00 04
        const expectedPrefix = Buffer.from('30820000020100300d06092a864886f70d010101050004', 'hex');
        // Mask out the length bytes (index 2-3)
        let matches = true;
        for (let i = 0; i < expectedPrefix.length; i++) {
            if (i === 2 || i === 3) continue;
            if (buffer[i] !== expectedPrefix[i]) {
                console.warn(`OID mismatch at byte ${i}: expected ${expectedPrefix[i].toString(16)}, got ${buffer[i].toString(16)}`);
                matches = false;
            }
        }
        if (matches) console.log('ASN.1 PKCS#8 OID Structure: VALID (RSA)');

        // Reconstruct with standard 64-char lines
        let normalizedKey = header + '\n';
        for (let i = 0; i < base64Part.length; i += 64) {
            normalizedKey += base64Part.substring(i, i + 64) + '\n';
        }
        normalizedKey += footer + '\n';

        console.log('Testing createPrivateKey with RAW DER BUFFER...');
        try {
            const derKey = crypto.createPrivateKey({
                key: buffer,
                format: 'der',
                type: 'pkcs8'
            });
            console.log('DER BUFFER SUCCESS!');
            console.log('Key type:', derKey.type);
            console.log('Asymmetric type:', derKey.asymmetricKeyType);

            // If this worked, then the problem is just the PEM formatting!
            console.log('--- ROOT CAUSE IDENTIFIED: PEM FORMATTING ---');
        } catch (derErr: any) {
            console.error('DER BUFFER ALSO FAILED:', derErr.message);
        }

        console.log('Testing normalized key with createPrivateKey...');
        try {
            crypto.createPrivateKey(normalizedKey);
            console.log('SUCCESS!');
        } catch (err: any) {
            console.error('FAILED:', err.message);
            // IF it fails, let's try PKCS#1 just in case the header was wrong
            console.log('Testing as PKCS#1 (RSA PRIVATE KEY)...');
            const pkcs1Header = '-----BEGIN RSA PRIVATE KEY-----';
            const pkcs1Footer = '-----END RSA PRIVATE KEY-----';
            const pkcs1Key = pkcs1Header + '\n' + base64Part.match(/.{1,64}/g)?.join('\n') + '\n' + pkcs1Footer + '\n';
            try {
                crypto.createPrivateKey(pkcs1Key);
                console.log('PKCS#1 SUCCESS! (The key was PKCS#1 but had a PKCS#8 header)');
            } catch (p1err: any) {
                console.error('PKCS#1 ALSO FAILED:', p1err.message);
            }
        }

    } catch (err: any) {
        console.error('DIAGNOSTIC CRASHED:', err.message);
    }
}

diagnose();
