import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Principal } from '../access/principal.js';

export const IS_PUBLIC = 'auth:public';
/** Marks a route as reachable without a session. Everything else requires one. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const STAFF_ONLY = 'auth:staff';
/** Restricts a controller or route to users holding at least one staff role. */
export const StaffOnly = () => SetMetadata(STAFF_ONLY, true);

export const ALLOW_PASSWORD_CHANGE = 'auth:allow-password-change';
/** Routes a user holding a temporary password may still use: changing it, signing out, reading who they are. */
export const AllowPasswordChange = () => SetMetadata(ALLOW_PASSWORD_CHANGE, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal => {
  return ctx.switchToHttp().getRequest<{ principal: Principal }>().principal;
});
