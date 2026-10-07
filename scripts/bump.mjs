/**
 * Bumps the version in the three places it lives (package.json, the extension
 * manifest, the helper) so a release is one command: `npm run bump`, commit, push.
 * The Release workflow publishes any pushed version that has no release yet.
 *
 *   npm run bump          -> 0.3.1 -> 0.3.2 (patch)
 *   npm run bump minor    -> 0.3.1 -> 0.4.0
 *   npm run bump major    -> 0.3.1 -> 1.0.0
 *   npm run bump 1.2.3    -> exactly that
 */
import { readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);
const arg = process.argv[2] ?? 'patch';
const next = /^\d+\.\d+\.\d+$/.test(arg) ? arg
  : arg === 'major' ? `${major + 1}.0.0`
  : arg === 'minor' ? `${major}.${minor + 1}.0`
  : `${major}.${minor}.${patch + 1}`;

const edits = [
  ['package.json', `"version": "${pkg.version}"`, `"version": "${next}"`],
  ['public/manifest.json', `"version": "${pkg.version}"`, `"version": "${next}"`],
  ['helper/main.go', `var version = "${pkg.version}"`, `var version = "${next}"`],
];
for (const [file, from, to] of edits) {
  const text = readFileSync(file, 'utf8');
  if (!text.includes(from)) {
    console.error(`${file} does not contain ${from}`);
    process.exit(1);
  }
  writeFileSync(file, text.replace(from, to));
}
console.log(`${pkg.version} -> ${next}  (package.json, public/manifest.json, helper/main.go)`);
console.log(`Now: git commit -am "release: v${next}" && git push`);
