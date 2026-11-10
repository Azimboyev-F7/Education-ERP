import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { isStaff } from '../access/access.policy.js';
import type { Principal } from '../access/principal.js';
import { AuthService } from './auth.service.js';
import { IS_PUBLIC, STAFF_ONLY } from './decorators.js';

export function sessionCookieName(): string {
  return process.env.SESSION_COOKIE_NAME ?? 'erp_session';
}

/** Global guard: every route needs a valid session unless marked @Public(). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const request = context.switchToHttp().getRequest<Request & { principal?: Principal }>();
    const token: unknown = request.cookies?.[sessionCookieName()];
    const principal = typeof token === 'string' && token ? await this.auth.resolve(token) : null;
    if (!principal) throw new UnauthorizedException();
    request.principal = principal;

    if (this.reflector.getAllAndOverride<boolean>(STAFF_ONLY, targets) && !isStaff(principal)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
