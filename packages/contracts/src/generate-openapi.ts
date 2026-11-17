import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { API_INFO, buildOpenApi } from './openapi.js';

/** The reference document committed to the repository, for people and tools that don't run the server. */
export const SPEC_PATH = resolve(import.meta.dirname, '../../../docs/openapi.json');

export function renderSpec(): string {
  const document = buildOpenApi({ ...API_INFO, servers: [{ url: 'http://localhost:4000', description: 'Local development' }] });
  return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * `node dist/generate-openapi.js`          writes docs/openapi.json
 * `node dist/generate-openapi.js --check`  exits non-zero if the committed file is out of date
 */
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const rendered = renderSpec();
  if (process.argv.includes('--check')) {
    const committed = existsSync(SPEC_PATH) ? readFileSync(SPEC_PATH, 'utf8') : '';
    if (committed !== rendered) {
      console.error('docs/openapi.json is out of date. Run: pnpm --filter @erp/contracts run openapi');
      process.exit(1);
    }
    console.log('docs/openapi.json is up to date');
  } else {
    mkdirSync(dirname(SPEC_PATH), { recursive: true });
    writeFileSync(SPEC_PATH, rendered);
    console.log(`Wrote ${SPEC_PATH}`);
  }
}
