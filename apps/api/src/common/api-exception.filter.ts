import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ApiError } from '@erp/contracts';
import type { Response } from 'express';

/**
 * Gives every error the same body — `{ statusCode, message, code?, issues? }` — whatever produced it
 * (validation, the session guard, a service, or a crash). Clients and the generated API documentation
 * can then rely on a single shape. Unexpected errors are logged and reported without internals.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body =
      exception instanceof HttpException ? describe(exception) : (clientError(exception) ?? this.unexpected(exception));
    response.status(body.statusCode).json(body);
  }

  private unexpected(exception: unknown): ApiError {
    this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };
  }
}

/** Errors raised by Express middleware, e.g. malformed JSON (400) or an oversized body (413). */
function clientError(exception: unknown): ApiError | null {
  if (typeof exception !== 'object' || exception === null) return null;
  const { statusCode, status, message } = exception as { statusCode?: unknown; status?: unknown; message?: unknown };
  const code = typeof statusCode === 'number' ? statusCode : status;
  if (typeof code !== 'number' || code < 400 || code > 499) return null;
  return { statusCode: code, message: typeof message === 'string' ? message : 'Bad request' };
}

function describe(exception: HttpException): ApiError {
  const statusCode = exception.getStatus();
  const raw = exception.getResponse();
  if (typeof raw === 'string') return { statusCode, message: raw };

  const { message, code, issues } = raw as { message?: unknown; code?: unknown; issues?: unknown };
  return {
    statusCode,
    message: Array.isArray(message) ? message.join('; ') : typeof message === 'string' ? message : exception.message,
    ...(typeof code === 'string' ? { code } : {}),
    ...(Array.isArray(issues) ? { issues: issues as ApiError['issues'] } : {}),
  };
}
