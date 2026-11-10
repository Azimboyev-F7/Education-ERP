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
import { LoginRequest, type Me } from '@erp/contracts';
import type { Request, Response } from 'express';
import type { Principal } from '../access/principal.js';
import { AuditService } from '../audit/audit.service.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AuthService, sessionTtlMs } from './auth.service.js';
import { CurrentUser, Public } from './decorators.js';
import { LoginThrottle } from './login-throttle.js';
import { sessionCookieName } from './session.guard.js';

@Controller('auth')
export class AuthController {
  private readonly throttle = new LoginThrottle();

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

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token: unknown = req.cookies?.[sessionCookieName()];
    if (typeof token === 'string') await this.auth.logout(token);
    res.clearCookie(sessionCookieName(), { path: '/' });
  }

  @Get('me')
  me(@CurrentUser() user: Principal): Me {
    return {
      id: user.userId,
      centerId: user.centerId,
      username: user.username,
      fullName: user.fullName,
      roles: user.roles,
      isStudent: user.isStudent,
    };
  }
}
