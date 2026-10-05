/**
 * One-off: creates key.pem (gitignored) and prints the manifest "key" and the
 * extension ID it produces. The ID must be fixed because the native helper only
 * accepts connections from that exact chrome-extension:// origin.
 *
 * The ID is the first 32 hex digits of sha256(public key DER), mapped 0-f -> a-p.
 */
import { generateKeyPairSync, createHash, createPublicKey } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

let pem;
if (existsSync('key.pem')) {
  pem = readFileSync('key.pem', 'utf8');
} else {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  writeFileSync('key.pem', pem);
}
const der = createPublicKey(pem).export({ type: 'spki', format: 'der' });
const id = [...createHash('sha256').update(der).digest('hex').slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join('');
console.log(JSON.stringify({ key: der.toString('base64'), id }, null, 2));
