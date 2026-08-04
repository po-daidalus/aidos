// aidos.de — keyed pseudonymization for natural persons (DSGVO).
// A Google place_id is a public direct identifier (place_id → Google → name/address).
// An UNSALTED hash of it is reversible by dictionary attack over public place_ids, so it is
// pseudonymous, not anonymous. We therefore key the hash with a secret salt that never leaves
// this machine (pipeline/.salt is gitignored). For nameable legal persons we keep the raw
// place_id (they are public companies); only natural-person rows are hashed.
import fs from 'node:fs';
import crypto from 'node:crypto';

const SALT_PATH = new URL('.salt', import.meta.url);
// Fingerprint of the salt, committed to git. sha256 of 32 random bytes reveals nothing (there is
// nothing to brute-force), but it lets us PROVE the right salt is in use. Without this the previous
// behaviour was to silently mint a fresh salt whenever .salt was missing — on a second machine, or
// after the file was lost — which reassigns every anonymized entity a new aid. The panel history for
// those 480 natural persons would break with no error at all: they would simply reappear as new
// entities and drop out of the month-over-month comparison. Silence is the dangerous part, so any
// mismatch is now a hard stop.
const FP_PATH = new URL('salt.fingerprint', import.meta.url);
const fingerprint = (s) => crypto.createHash('sha256').update('aidos-salt-fp|' + s).digest('hex');

function loadSalt() {
  const expected = fs.existsSync(FP_PATH) ? fs.readFileSync(FP_PATH, 'utf8').trim() : null;
  let s = null;
  try {
    const raw = fs.readFileSync(SALT_PATH, 'utf8').trim();
    if (raw.length >= 32) s = raw;
  } catch { /* not present */ }

  if (s && expected) {
    if (fingerprint(s) !== expected) {
      throw new Error(
        'salt.mjs: pipeline/.salt does NOT match pipeline/salt.fingerprint.\n' +
        '  Using it would assign new aids to every anonymized entity and silently break their panel\n' +
        '  history. Restore the correct salt (password manager / Keychain: "aidos-pipeline-salt").\n' +
        '  Only if the salt is genuinely gone and you accept losing continuity for anonymized rows:\n' +
        '  delete pipeline/salt.fingerprint and re-run to mint a new one.');
    }
    return s;
  }
  if (!s && expected) {
    throw new Error(
      'salt.mjs: pipeline/.salt is MISSING but pipeline/salt.fingerprint exists.\n' +
      '  Refusing to mint a new salt — that would silently reassign every anonymized entity and\n' +
      '  break the month-over-month panel for them.\n' +
      '  Restore it from the password manager / Keychain ("aidos-pipeline-salt"), e.g.\n' +
      '    security find-generic-password -s aidos-pipeline-salt -w > pipeline/.salt\n' +
      '  Verify with: node pipeline/salt.mjs --check');
  }
  if (s && !expected) { // salt predates the fingerprint file — adopt it
    fs.writeFileSync(FP_PATH, fingerprint(s) + '\n');
    console.log('salt.mjs: recorded fingerprint of the existing salt → pipeline/salt.fingerprint');
    return s;
  }
  s = crypto.randomBytes(32).toString('hex');           // genuine first run
  fs.writeFileSync(SALT_PATH, s + '\n', { mode: 0o600 });
  fs.writeFileSync(FP_PATH, fingerprint(s) + '\n');
  console.log('salt.mjs: generated a new secret salt at pipeline/.salt — BACK IT UP NOW (password manager).');
  console.log('          Losing it breaks panel continuity for every anonymized row, irreversibly.');
  return s;
}

const SALT = loadSalt();

// Stable, salted, non-reversible id for a natural-person entity.
export const anonId = (placeId) => crypto.createHash('sha256').update(SALT + '|' + String(placeId)).digest('hex').slice(0, 16);

// node pipeline/salt.mjs --check — confirms the salt in place is the right one, prints no secret.
if (process.argv[1] && process.argv[1].endsWith('salt.mjs') && process.argv.includes('--check')) {
  console.log('✓ salt present and matching pipeline/salt.fingerprint (' + fingerprint(SALT).slice(0, 12) + '…)');
}
