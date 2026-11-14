/**
 * npm run seed:demo
 *
 * Builds the fictional demo dataset in memory and writes it as a Ledger
 * backup file (demo/ledger-demo-backup.json). Copy that file to the phone
 * and use Settings > Export and import > Restore from a JSON file.
 */
import fs from 'node:fs';
import Module from 'node:module';
import path from 'node:path';

// expo-crypto is native; give the script Node's equivalent.
const real = (Module as unknown as { _resolveFilename: (...a: unknown[]) => string })
  ._resolveFilename;
(Module as unknown as { _resolveFilename: (...a: unknown[]) => string })._resolveFilename =
  function (request: unknown, ...rest: unknown[]) {
    return real.call(
      this,
      request === 'expo-crypto' ? path.join(__dirname, 'expo-crypto-shim.ts') : request,
      ...rest,
    );
  };

async function main() {
  const { createTestDb } = await import('../test/db');
  const { seedDemo } = await import('../src/seed/demo');
  const { exportSnapshot } = await import('../src/data/backup');
  const { dayFromDate } = await import('../src/domain/dates');
  const { db } = createTestDb();
  seedDemo(db, dayFromDate(new Date()));
  const snapshot = exportSnapshot(db, 'demo');
  const out = path.join(__dirname, '..', 'demo');
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, 'ledger-demo-backup.json');
  fs.writeFileSync(file, JSON.stringify(snapshot));
  console.log(`Wrote ${file}`);
  console.log(snapshot.counts);
}

void main();
