// aidos.de — keyed pseudonymization for natural persons (DSGVO).
// A Google place_id is a public direct identifier (place_id → Google → name/address).
// An UNSALTED hash of it is reversible by dictionary attack over public place_ids, so it is
// pseudonymous, not anonymous. We therefore key the hash with a secret salt that never leaves
// this machine (pipeline/.salt is gitignored). For nameable legal persons we keep the raw
// place_id (they are public companies); only natural-person rows are hashed.
import fs from 'node:fs';
import crypto from 'node:crypto';

const SALT_PATH = new URL('.salt', import.meta.url);

function loadSalt() {
  try {
    const s = fs.readFileSync(SALT_PATH, 'utf8').trim();
    if (s.length >= 32) return s;
  } catch { /* not yet created */ }
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SALT_PATH, s + '\n', { mode: 0o600 });
  console.log('salt.mjs: generated new secret salt at pipeline/.salt (keep it — losing it breaks panel continuity for anonymized rows)');
  return s;
}

const SALT = loadSalt();

// Stable, salted, non-reversible id for a natural-person entity.
export const anonId = (placeId) => crypto.createHash('sha256').update(SALT + '|' + String(placeId)).digest('hex').slice(0, 16);
