/**
 * Create a Vonage application for the video room and keep its private key.
 *
 * Vonage returns a generated private key exactly once, so this generates the
 * keypair locally and uploads only the public half. The private key is written
 * to disk and never leaves this machine.
 *
 * Usage:  node --env-file=.env.local scripts/create-vonage-app.mjs [name]
 */

import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";

const { VONAGE_API_KEY: key, VONAGE_API_SECRET: secret } = process.env;
if (!key || !secret) {
  console.error("Set VONAGE_API_KEY and VONAGE_API_SECRET first.");
  process.exit(1);
}

const name = process.argv[2] ?? "LinguaTrace";
const keyPath = "vonage_private.key";
const auth = "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const response = await fetch("https://api.nexmo.com/v2/applications", {
  method: "POST",
  headers: { Authorization: auth, "Content-Type": "application/json" },
  body: JSON.stringify({
    name,
    capabilities: { video: {} },
    keys: { public_key: publicKey },
  }),
});

if (!response.ok) {
  console.error(`Vonage refused (${response.status}):`, (await response.text()).slice(0, 300));
  process.exit(1);
}

const app = await response.json();
writeFileSync(keyPath, privateKey, { mode: 0o600 });

console.log(`Created "${app.name}" with capabilities: ${Object.keys(app.capabilities).join(", ")}`);
console.log(`Private key written to ${keyPath} (gitignored).\n`);
console.log("Add to .env.local:\n");
console.log(`VONAGE_APPLICATION_ID=${app.id}`);
console.log(`VONAGE_PRIVATE_KEY_PATH=${keyPath}`);
