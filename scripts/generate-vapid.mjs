#!/usr/bin/env node
// Run: node scripts/generate-vapid.mjs
// Generates VAPID key pair for Web Push Notifications.
// Add the output values to your Replit Secrets.

import { generateVAPIDKeys } from "web-push";

const keys = generateVAPIDKeys();

console.log("\n✅ VAPID Keys Generated Successfully\n");
console.log("Add these to your environment secrets:\n");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:admin@yourdomain.com`);
console.log("\n⚠️  Keep VAPID_PRIVATE_KEY secret — never expose it in frontend code.");
console.log("    VAPID_PUBLIC_KEY is safe to use in frontend (VITE_VAPID_PUBLIC_KEY).\n");
