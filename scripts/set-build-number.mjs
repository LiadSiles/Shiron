#!/usr/bin/env node
// CI only: stamps the build number into app/app.json before `expo prebuild`, so every APK
// has a higher Android versionCode (and every IPA a higher CFBundleVersion) than the last.
// Usage: node scripts/set-build-number.mjs <number>
import fs from 'node:fs';
import path from 'node:path';

const n = Number(process.argv[2]);
if (!Number.isInteger(n) || n < 1) {
  console.error('usage: set-build-number.mjs <positive integer>');
  process.exit(1);
}
const file = path.join(path.dirname(path.dirname(new URL(import.meta.url).pathname)), 'app', 'app.json');
const app = JSON.parse(fs.readFileSync(file, 'utf8'));
app.expo.android.versionCode = n;
app.expo.ios.buildNumber = String(n);
fs.writeFileSync(file, JSON.stringify(app, null, 2) + '\n');
console.log(`version ${app.expo.version}, build ${n}`);
