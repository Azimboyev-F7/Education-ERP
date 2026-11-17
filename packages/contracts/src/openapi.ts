import { z } from 'zod';
import { type Endpoint, ENDPOINTS, errorStatuses, openApiPath, pathParams, successStatus } from './endpoints.js';
import { ApiError } from './responses/common.js';

type Json = { [key: string]: unknown };

export interface OpenApiOptions {
  title: string;
  version: string;
  description?: string;
  /** Base URL(s) the API is reachable at. */
  servers?: { url: string; description?: string }[];
  /** Name of the session cookie. */
  cookieName?: string;
}

const STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  204: 'No content',
  400: 'The request is not valid. `issues` lists the fields at fault.',
  401: 'Not signed in, or the session has expired.',
  403: 'Not allowed for this account or role, or a temporary password must be changed first (`code: PASSWORD_CHANGE_REQUIRED`).',
  404: 'Not found, or outside the caller’s scope. The two are deliberately indistinguishable.',
  409: 'Conflicts with the current state of the resource.',
  429: 'Too many attempts. Try again later.',
};

/** What zod cannot say on its own: dates travel as ISO strings, and format patterns only add noise. */
const override = (ctx: { zodSchema: unknown; jsonSchema: Json }): void => {
  const { zodSchema, jsonSchema } = ctx;
  const type = (zodSchema as { _zod?: { def?: { type?: string } } })._zod?.def?.type;
  if (type === 'date') {
    jsonSchema.type = 'string';
    jsonSchema.format = 'date-time';
  }
  if (jsonSchema.format === 'date-time' || jsonSchema.format === 'date') delete jsonSchema.pattern;
  // `.int()` adds the safe-integer range, which is noise in documentation.
  if (jsonSchema.minimum === Number.MIN_SAFE_INTEGER) delete jsonSchema.minimum;
  if (jsonSchema.maximum === Number.MAX_SAFE_INTEGER) delete jsonSchema.maximum;
};

/** `#/$defs/Name` (what zod emits) → `#/components/schemas/Name`. */
function rewriteRefs(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(rewriteRefs);
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) =>
        key === '$ref' && typeof value === 'string'
          ? [key, value.replace('#/$defs/', '#/components/schemas/')]
          : [key, rewriteRefs(value)],
      ),
    );
  }
  return node;
}

/** Converts a schema, collecting its named parts into `components`. `input` is what a client may send, `output` what it receives. */
function convert(schema: z.ZodType, io: 'input' | 'output', components: Record<string, unknown>): Json {
  const generated = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io,
    unrepresentable: 'any',
    override: override as never,
  }) as Json;
  const { $schema: _ignored, $defs, ...root } = generated;

  for (const [name, definition] of Object.entries(($defs ?? {}) as Record<string, unknown>)) {
    const rewritten = rewriteRefs(definition);
    const existing = components[name];
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(rewritten)) {
      throw new Error(`The schema name "${name}" is used for two different shapes`);
    }
    components[name] = rewritten;
  }
  return rewriteRefs(root) as Json;
}

function queryParameters(schema: z.ZodType, components: Record<string, unknown>): Json[] {
  const converted = convert(schema, 'input', components);
  const properties = (converted.properties ?? {}) as Record<string, Json>;
  const required = new Set((converted.required ?? []) as string[]);
  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: 'query',
    required: required.has(name),
    schema: property,
  }));
}

const errorResponse = (status: number): Json => ({
  description: STATUS_TEXT[status] ?? 'Error',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
});

function operation(endpoint: Endpoint, components: Record<string, unknown>): Json {
  const parameters: Json[] = [
    ...pathParams(endpoint.path).map((name) => ({ name, in: 'path', required: true, schema: { type: 'string' } })),
    ...(endpoint.query ? queryParameters(endpoint.query, components) : []),
  ];

  const success = successStatus(endpoint);
  const successResponse: Json = endpoint.response
    ? {
        description: STATUS_TEXT[success] ?? 'Success',
        content: { 'application/json': { schema: convert(endpoint.response, 'output', components) } },
      }
    : { description: STATUS_TEXT[success] ?? 'Success' };
  if (endpoint.noStore) successResponse.headers = { 'Cache-Control': { schema: { type: 'string', const: 'no-store' } } };

  const description = [endpoint.description, `**Who can call this:** ${endpoint.who}.`].filter(Boolean).join('\n\n');

  return {
    operationId: endpoint.id,
    tags: [endpoint.tag],
    summary: endpoint.summary,
    description,
    ...(parameters.length ? { parameters } : {}),
    ...(endpoint.body
      ? { requestBody: { required: true, content: { 'application/json': { schema: convert(endpoint.body, 'input', components) } } } }
      : {}),
    responses: {
      [success]: successResponse,
      ...Object.fromEntries(errorStatuses(endpoint).map((status) => [status, errorResponse(status)])),
    },
    security: endpoint.public ? [] : [{ sessionCookie: [] }],
  };
}

/** Builds the OpenAPI 3.1 document from the endpoint registry. Pure: the same registry always gives the same document. */
export function buildOpenApi(options: OpenApiOptions, endpoints: readonly Endpoint[] = ENDPOINTS): Json {
  const components: Record<string, unknown> = {};
  convert(ApiError, 'output', components);

  const paths: Record<string, Record<string, unknown>> = {};
  for (const endpoint of endpoints) {
    const key = openApiPath(endpoint.path);
    const item = (paths[key] ??= {});
    if (item[endpoint.method]) throw new Error(`${endpoint.method.toUpperCase()} ${endpoint.path} is listed twice`);
    item[endpoint.method] = operation(endpoint, components);
  }

  const tags = [...new Set(endpoints.map((e) => e.tag))].map((name) => ({ name }));
  const sortedSchemas = Object.fromEntries(Object.entries(components).sort(([a], [b]) => a.localeCompare(b)));

  return {
    openapi: '3.1.0',
    info: {
      title: options.title,
      version: options.version,
      ...(options.description ? { description: options.description } : {}),
    },
    servers: options.servers ?? [{ url: '/' }],
    tags,
    paths,
    components: {
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: options.cookieName ?? 'erp_session',
          description: 'Set by `POST /auth/login`. httpOnly; sent automatically by browsers.',
        },
      },
      schemas: sortedSchemas,
    },
  };
}

export const API_INFO = {
  title: 'Education ERP API',
  version: '1.0.0',
  description:
    'IELTS teaching and self-training platform.\n\n' +
    'Every request needs the session cookie from `POST /auth/login`, except the ones marked public. ' +
    'Accounts holding a temporary password can only call `/auth/me`, `/auth/password` and `/auth/logout` until they change it ' +
    '(other routes answer 403 with `code: PASSWORD_CHANGE_REQUIRED`).\n\n' +
    'Dates are ISO-8601 strings in UTC. Rows outside the caller’s scope answer 404, never 403, so their existence is not revealed.',
} as const;
