import { z } from 'zod';

/**
 * What goes over the wire. Responses are JSON, so every date arrives as an ISO-8601 string;
 * the schemas describe that, not the `Date` objects the server holds before serialising.
 */
export const IsoDateTime = z.iso.datetime();

/** Gives a schema a stable name, which becomes its entry under `components.schemas` in the OpenAPI document. */
export const named = <T extends z.ZodType>(id: string, schema: T): T => schema.meta({ id });

export const ApiIssue = named('ApiIssue', z.object({ path: z.string(), message: z.string() }));

/** Every error response has this shape, whichever layer produced it. */
export const ApiError = named(
  'ApiError',
  z.object({
    statusCode: z.number().int(),
    message: z.string(),
    /** Machine-readable reason, present when a client needs to react to it (e.g. PASSWORD_CHANGE_REQUIRED). */
    code: z.string().optional(),
    /** Field-level problems for validation failures. */
    issues: z.array(ApiIssue).optional(),
  }),
);
export type ApiError = z.infer<typeof ApiError>;

export const IdResponse = named('IdResponse', z.object({ id: z.string() }));
export type IdResponse = z.infer<typeof IdResponse>;

export const IdRef = z.object({ id: z.string(), name: z.string() });
export const PersonRef = z.object({ id: z.string(), fullName: z.string() });

export const HealthResponse = named('HealthResponse', z.object({ status: z.literal('ok') }));
export type HealthResponse = z.infer<typeof HealthResponse>;
