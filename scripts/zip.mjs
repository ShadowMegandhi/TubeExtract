/**
 * Packs dist/ into release/tubeextract-extension-v<version>.zip for people to
 * unzip and "Load unpacked". Uses the system zip tool so the repo needs no zip
 * dependency. On Windows that is the bundled bsdtar: PowerShell's
 * Compress-Archive writes backslash paths that break unzipping on macOS/Linux.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

if (!existsSync('dist/manifest.json')) {
  console.error('dist/ is missing. Run npm run build first.');
  process.exit(1);
}
const { version } = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
mkdirSync('release', { recursive: true });
const out = resolve(`release/tubeextract-extension-v${version}.zip`);
rmSync(out, { force: true });

if (process.platform === 'win32') {
  const entries = readdirSync('dist');
  // Windows' own bsdtar by full path: Git Bash puts a GNU tar first on PATH,
  // which can't write zips and reads "C:" as a remote host.
  const tar = resolve(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'tar.exe');
  execFileSync(tar, ['-a', '-c', '-f', out, ...entries], { cwd: 'dist', stdio: 'inherit' });
} else {
  execFileSync('zip', ['-qr', out, '.'], { cwd: 'dist', stdio: 'inherit' });
}
console.log(`OK - ${out}`);
