import { API_INFO, buildOpenApi } from '@erp/contracts';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-dist';
import { sessionCookieName } from '../auth/session.guard.js';

/** The OpenAPI document for this server, generated from the endpoint registry in @erp/contracts. */
export function openApiDocument() {
  return buildOpenApi({ ...API_INFO, cookieName: sessionCookieName(), servers: [{ url: '/' }] });
}

/**
 * Documentation is on everywhere except production, where `API_DOCS=on` turns it on. The
 * document describes shapes and rules, never data, but a public API reference is still a choice.
 */
export function docsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.API_DOCS === 'on') return true;
  if (env.API_DOCS === 'off') return false;
  return env.NODE_ENV !== 'production';
}

/**
 * The page is served at `/docs` and `/docs/` alike (Next.js's proxy strips trailing slashes, so
 * redirecting one to the other would loop). A `<base>` makes its assets resolve under `docs/` either
 * way; the spec is `../openapi.json` and "Try it out" targets the directory above, so nothing
 * depends on the prefix a proxy puts in front (`/docs/` directly, `/api/docs` through a front-end).
 */
const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <script>
      if (!location.pathname.endsWith('/')) document.write('<base href="' + location.pathname + '/">');
    </script>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${API_INFO.title}</title>
    <link rel="stylesheet" href="swagger-ui.css" />
  </head>
  <body>
    <div id="ui"></div>
    <script src="swagger-ui-bundle.js"></script>
    <script>
      fetch('../openapi.json')
        .then(function (response) { return response.json(); })
        .then(function (spec) {
          spec.servers = [{ url: new URL('..', document.baseURI).pathname }];
          window.ui = SwaggerUIBundle({ spec: spec, dom_id: '#ui', deepLinking: true });
        });
    </script>
  </body>
</html>
`;

/** Mounts `/openapi.json` and the interactive reference at `/docs/`. These sit outside the session guard. */
export function mountDocs(app: NestExpressApplication): void {
  if (!docsEnabled()) return;
  const document = openApiDocument();

  app.use('/openapi.json', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.json(document);
  });

  app.use('/docs', (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/' || req.path === '/index.html') return res.type('html').send(PAGE);
    return next();
  });
  app.useStaticAssets(swaggerUi.getAbsoluteFSPath(), { prefix: '/docs', index: false });
}
