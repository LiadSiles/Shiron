#!/usr/bin/env node
// Bumps the app version in one place (app/app.json + app/package.json) and adds a
// CHANGELOG section. Usage: npm run version:bump -- patch|minor|major|X.Y.Z
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const appJsonPath = path.join(root, 'app', 'app.json');
const pkgPath = path.join(root, 'app', 'package.json');
const changelogPath = path.join(root, 'CHANGELOG.md');

const arg = process.argv[2];
if (!arg) {
  console.error('usage: npm run version:bump -- patch|minor|major|X.Y.Z');
  process.exit(1);
}

const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const current = appJson.expo.version;
const [maj, min, pat] = current.split('.').map(Number);
const next =
  arg === 'major' ? `${maj + 1}.0.0`
  : arg === 'minor' ? `${maj}.${min + 1}.0`
  : arg === 'patch' ? `${maj}.${min}.${pat + 1}`
  : /^\d+\.\d+\.\d+$/.test(arg) ? arg
  : null;
if (!next) {
  console.error(`not a version: ${arg}`);
  process.exit(1);
}

appJson.expo.version = next;
fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = next;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const changelog = fs.readFileSync(changelogPath, 'utf8');
const today = new Date().toISOString().slice(0, 10);
const marker = '## [Unreleased]';
if (changelog.includes(marker)) {
  fs.writeFileSync(changelogPath, changelog.replace(marker, `${marker}\n\n## [${next}] — ${today}`));
}

console.log(`${current} → ${next}`);
