const { fromSeed } = require('nkeys.js');
try {
    const seed = 'SAAFAQXRTFAEGXWYCK3OFQU2HVYB4KCHGX42D7Q3CTPSMDYAX6BTNPFIRU';
    const kp = fromSeed(Buffer.from(seed));
    console.log('Public Key:', kp.getPublicKey());
    console.log('Success');
} catch (err) {
    console.error('Error:', err.message);
}
