import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ChangePasswordRequest, LoginRequest, type Me } from '@erp/contracts';
import type { Request, Response } from 'express';
import type { Principal } from '../access/principal.js';
import { AuditService } from '../audit/audit.service.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AuthService, sessionTtlMs } from './auth.service.js';
import { AllowPasswordChange, CurrentUser, Public } from './decorators.js';
import { LoginThrottle } from './login-throttle.js';
import { sessionCookieName } from './session.guard.js';

@Controller('auth')
export class AuthController {
  private readonly throttle = new LoginThrottle();
  /** Guards the "current password" check against being used to guess a password from a stolen session. */
  private readonly passwordThrottle = new LoginThrottle();

  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.NO_CONTENT)
  async login(
    @Body(new ZodPipe(LoginRequest)) body: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const key = `${body.username.toLowerCase()}|${req.ip ?? ''}`;
    if (this.throttle.isBlocked(key)) {
      throw new HttpException('Too many attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const session = await this.auth.login(body.username, body.password);
    if (!session) {
      this.throttle.recordFailure(key);
      await this.audit.record({ action: 'auth.login_failed', data: { username: body.username } });
      throw new UnauthorizedException('Wrong username or password');
    }

    this.throttle.reset(key);
    await this.audit.record({ action: 'auth.login', actorId: session.userId, centerId: session.centerId });
    res.cookie(sessionCookieName(), session.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: sessionTtlMs(),
    });
  }

  @AllowPasswordChange()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token: unknown = req.cookies?.[sessionCookieName()];
    if (typeof token === 'string') await this.auth.logout(token);
    res.clearCookie(sessionCookieName(), { path: '/' });
  }

  @AllowPasswordChange()
  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: Principal,
    @Req() req: Request,
    @Body(new ZodPipe(ChangePasswordRequest)) body: ChangePasswordRequest,
  ): Promise<void> {
    if (this.passwordThrottle.isBlocked(user.userId)) {
      throw new HttpException('Too many attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const token = String(req.cookies?.[sessionCookieName()] ?? '');
    // A wrong current password is a 400, not a 401: a 401 would make clients treat the session as lost.
    if (!(await this.auth.changePassword(user, token, body.currentPassword, body.newPassword))) {
      this.passwordThrottle.recordFailure(user.userId);
      throw new HttpException('The current password is wrong', HttpStatus.BAD_REQUEST);
    }
    this.passwordThrottle.reset(user.userId);
    await this.audit.record({ action: 'auth.password_change', actorId: user.userId, centerId: user.centerId });
  }

  @AllowPasswordChange()
  @Get('me')
  me(@CurrentUser() user: Principal): Me {
    return {
      id: user.userId,
      centerId: user.centerId,
      username: user.username,
      fullName: user.fullName,
      roles: user.roles,
      isStudent: user.isStudent,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
