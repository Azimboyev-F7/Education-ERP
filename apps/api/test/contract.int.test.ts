import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { buildOpenApi, API_INFO, ENDPOINTS } from '@erp/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD, resetDb, seedOrg, startApp, type TestApp } from './harness.js';

const VERBS: Record<number, string> = {
  [RequestMethod.GET]: 'get',
  [RequestMethod.POST]: 'post',
  [RequestMethod.PUT]: 'put',
  [RequestMethod.DELETE]: 'delete',
  [RequestMethod.PATCH]: 'patch',
};

const joinPath = (...parts: string[]) => '/' + parts.flatMap((p) => p.split('/')).filter(Boolean).join('/');

/** Every route the running server actually exposes, read from the controllers' decorators. */
function serverRoutes(t: TestApp): string[] {
  const routes: string[] = [];
  for (const module of t.app.get(ModulesContainer).values()) {
    for (const { metatype } of module.controllers.values()) {
      if (!metatype) continue;
      const base = (Reflect.getMetadata(PATH_METADATA, metatype) as string | undefined) ?? '';
      for (const name of Object.getOwnPropertyNames(metatype.prototype)) {
        const handler = (metatype.prototype as Record<string, unknown>)[name];
        if (typeof handler !== 'function') continue;
        const verb = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
        if (verb === undefined) continue;
        const path = (Reflect.getMetadata(PATH_METADATA, handler) as string | undefined) ?? '';
        routes.push(`${VERBS[verb]} ${joinPath(base, path)}`);
      }
    }
  }
  return routes.sort();
}

describe('API contract', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startApp();
    await resetDb(t.prisma);
    await seedOrg(t.prisma);
  });
  afterAll(() => t.close());

  it('documents every route the server exposes, and nothing else', () => {
    const documented = ENDPOINTS.map((e) => `${e.method} ${e.path}`).sort();
    expect(serverRoutes(t)).toEqual(documented);
  });

  it('serves the same document that the registry generates', async () => {
    const response = await fetch(`${t.url}/openapi.json`);
    expect(response.status).toBe(200);
    const served = (await response.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(served.openapi).toBe('3.1.0');
    expect(Object.keys(served.paths)).toContain('/groups/{id}');
    expect(served).toEqual(JSON.parse(JSON.stringify(buildOpenApi({ ...API_INFO, servers: [{ url: '/' }] }))));
  });

  it('serves the interactive reference with or without a trailing slash, never redirecting', async () => {
    // Behind Next.js's /api proxy a redirect between the two forms would loop forever.
    for (const path of ['/docs', '/docs/']) {
      const page = await fetch(`${t.url}${path}`, { redirect: 'manual' });
      expect(page.status, path).toBe(200);
      expect(await page.text()).toContain('swagger-ui-bundle.js');
    }
    expect((await fetch(`${t.url}/docs/swagger-ui-bundle.js`)).status).toBe(200);
  });

  it('answers every kind of failure with the same error shape', async () => {
    const anonymous = t.anonymous();
    const signedIn = await t.as('admin');

    // Guard (401), validation (400) and not-found (404) are checked against ApiError by the harness itself.
    expect((await anonymous.get('/groups')).status).toBe(401);
    const invalid = await signedIn.post('/branches', { name: '' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.issues[0]).toEqual({ path: 'name', message: expect.any(String) });
    expect((await signedIn.get('/groups/does-not-exist')).status).toBe(404);

    // Failures raised by Express itself (malformed JSON) and routes that do not exist are not
    // in the registry, so they are checked directly.
    const cookie = (await fetch(`${t.url}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: PASSWORD }),
    })).headers.getSetCookie()[0]!.split(';')[0]!;
    const malformed = await fetch(`${t.url}/branches`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: '{ nope',
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ statusCode: 400, message: expect.any(String) });

    const unknown = await fetch(`${t.url}/no/such/route`, { headers: { cookie } });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ statusCode: 404, message: expect.any(String) });
  });
});
