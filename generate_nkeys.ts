import { createAccount, createUser } from 'nkeys.js';

function generate() {
    const issuer = createAccount();
    const user = createUser();

    console.log("--- NATS CONFIG KEYS ---");
    console.log("ISSUER_PUBLIC_KEY:", issuer.getPublicKey());
    const decoder = new TextDecoder();
    console.log("ISSUER_SEED (KEEP SECRET):", decoder.decode(issuer.getSeed()));
    console.log("");
    console.log("BRIDGE_PUBLIC_KEY:", user.getPublicKey());
    console.log("BRIDGE_SEED (KEEP SECRET):", decoder.decode(user.getSeed()));
    console.log("------------------------");
}

generate();
