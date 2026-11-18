import { existsSync, readFileSync } from 'node:fs';
import { validate } from '@readme/openapi-parser';
import { describe, expect, it } from 'vitest';
import { ENDPOINTS, errorStatuses, openApiPath, pathParams, successStatus } from './endpoints.js';
import { renderSpec, SPEC_PATH } from './generate-openapi.js';
import { API_INFO, buildOpenApi } from './openapi.js';

describe('endpoint registry', () => {
  it('has unique ids and unique method + path pairs', () => {
    const ids = ENDPOINTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const routes = ENDPOINTS.map((e) => `${e.method} ${e.path}`);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('only gives a body to methods that carry one, and a success status that fits its content', () => {
    for (const e of ENDPOINTS) {
      if (e.method === 'get' || e.method === 'delete') expect(e.body, e.id).toBeUndefined();
      if (e.response) expect(successStatus(e), e.id).toBeLessThan(204);
      else expect(successStatus(e), e.id).toBe(204);
    }
  });

  it('documents authentication failures on every route that needs a session', () => {
    for (const e of ENDPOINTS.filter((e) => !e.public)) expect(errorStatuses(e), e.id).toEqual(expect.arrayContaining([401, 403]));
  });

  it('turns Express paths into OpenAPI paths', () => {
    expect(openApiPath('/groups/:id/students/:studentId/remove')).toBe('/groups/{id}/students/{studentId}/remove');
    expect(pathParams('/groups/:id/students/:studentId/remove')).toEqual(['id', 'studentId']);
  });
});

describe('OpenAPI document', () => {
  const document = buildOpenApi(API_INFO);

  it('is a valid OpenAPI 3.1 document', async () => {
    const result = await validate(JSON.parse(JSON.stringify(document)));
    expect(result.valid, JSON.stringify(result.valid ? [] : result.errors, null, 2)).toBe(true);
  });

  it('describes every endpoint exactly once, with a unique operation id', () => {
    const operations = Object.values(document.paths as Record<string, Record<string, { operationId: string }>>).flatMap((item) =>
      Object.values(item),
    );
    expect(operations).toHaveLength(ENDPOINTS.length);
    expect(new Set(operations.map((o) => o.operationId)).size).toBe(ENDPOINTS.length);
  });

  it('exposes named schemas as components and never leaves a dangling reference', () => {
    const text = JSON.stringify(document);
    const defined = new Set(Object.keys((document.components as { schemas: object }).schemas));
    for (const [, name] of text.matchAll(/#\/components\/schemas\/([A-Za-z0-9_]+)/g)) expect(defined.has(name!), name).toBe(true);
    expect(text).not.toContain('#/$defs');
  });

  it('marks one-time passwords as uncacheable and public routes as not needing a session', () => {
    const paths = document.paths as Record<string, Record<string, any>>;
    expect(paths['/students']!.post.responses['201'].headers['Cache-Control']).toBeDefined();
    expect(paths['/auth/login']!.post.security).toEqual([]);
    expect(paths['/groups']!.get.security).toEqual([{ sessionCookie: [] }]);
  });

  it('matches the committed docs/openapi.json (run `pnpm --filter @erp/contracts run openapi` after changing a contract)', () => {
    expect(existsSync(SPEC_PATH), 'docs/openapi.json is missing').toBe(true);
    expect(readFileSync(SPEC_PATH, 'utf8')).toBe(renderSpec());
  });
});
