import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ApiError, type Endpoint, ENDPOINTS, errorStatuses, successStatus } from '@erp/contracts';

/**
 * Holds the server to its published contract. Every request the integration tests make goes
 * through here: the route must be documented, the status must be one the documentation lists,
 * and the body must match the documented schema — field for field, so a column that leaks into a
 * response fails the suite just as a missing one does.
 */

const matchers = ENDPOINTS.map((endpoint) => ({
  endpoint,
  pattern: new RegExp(`^${endpoint.path.replace(/:[A-Za-z]+/g, '[^/]+')}$`),
  literalSegments: endpoint.path.split('/').filter((segment) => segment && !segment.startsWith(':')).length,
}));

export function findEndpoint(method: string, path: string): Endpoint | undefined {
  const pathname = path.split('?')[0]!;
  return matchers
    .filter((m) => m.endpoint.method === method.toLowerCase() && m.pattern.test(pathname))
    .sort((a, b) => b.literalSegments - a.literalSegments)[0]?.endpoint;
}

export const HITS_DIR = join(import.meta.dirname, '.hits');

function recordHit(endpoint: Endpoint): void {
  mkdirSync(HITS_DIR, { recursive: true });
  appendFileSync(join(HITS_DIR, `${process.pid}.txt`), `${endpoint.id}\n`);
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Paths of fields present in `actual` that the schema dropped, i.e. fields the contract does not declare. */
function undeclaredFields(actual: unknown, parsed: unknown, at = '$'): string[] {
  if (Array.isArray(actual) && Array.isArray(parsed)) {
    return actual.flatMap((item, index) => undeclaredFields(item, parsed[index], `${at}[${index}]`));
  }
  if (isObject(actual) && isObject(parsed)) {
    return Object.keys(actual).flatMap((key) =>
      key in parsed ? undeclaredFields(actual[key], parsed[key], `${at}.${key}`) : [`${at}.${key}`],
    );
  }
  return [];
}

export interface ObservedReply {
  status: number;
  body: unknown;
  headers: Headers;
}

export function checkContract(method: string, path: string, reply: ObservedReply): void {
  const label = `${method.toUpperCase()} ${path} → ${reply.status}`;
  const endpoint = findEndpoint(method, path);
  if (!endpoint) throw new Error(`${label}: this route is not in the endpoint registry (packages/contracts/src/endpoints.ts)`);

  if (reply.status === successStatus(endpoint)) {
    recordHit(endpoint);
    if (endpoint.noStore && reply.headers.get('cache-control') !== 'no-store') {
      throw new Error(`${label}: a one-time password must be sent with Cache-Control: no-store`);
    }
    if (!endpoint.response) {
      if (reply.body !== null) throw new Error(`${label}: documented as having no body, but got ${JSON.stringify(reply.body)}`);
      return;
    }
    const parsed = endpoint.response.safeParse(reply.body);
    if (!parsed.success) {
      const problems = parsed.error.issues.map((i) => `${i.path.join('.') || '$'}: ${i.message}`).join('\n  ');
      throw new Error(`${label}: the body does not match the documented response (${endpoint.id})\n  ${problems}`);
    }
    const extra = undeclaredFields(reply.body, parsed.data);
    if (extra.length > 0) {
      throw new Error(`${label}: the body has fields the contract does not declare (${endpoint.id}): ${extra.join(', ')}`);
    }
    return;
  }

  if (!errorStatuses(endpoint).includes(reply.status)) {
    throw new Error(`${label}: ${endpoint.id} documents ${[successStatus(endpoint), ...errorStatuses(endpoint)].join(', ')} but not ${reply.status}`);
  }
  const error = ApiError.safeParse(reply.body);
  if (!error.success || error.data.statusCode !== reply.status) {
    throw new Error(`${label}: error bodies must be { statusCode, message, … } but got ${JSON.stringify(reply.body)}`);
  }
}
