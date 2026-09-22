import { Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { loginSchema, LoginDto } from '@erp/shared';
import { AuthService } from './auth.service';
import { CurrentUser, JwtPayload, PlatformOnly, Public } from './decorators';
import { ZBody } from '../common/zod';
import { TenantContext } from '../tenancy/tenant-context';
import { config } from '../config';

const cookieName = (slug: string) => `erp_rt_${slug}`;

function setRefreshCookie(res: Response, name: string, token: string) {
  res.cookie(name, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: config.refreshTokenTtlDays * 86_400_000,
  });
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly ctx: TenantContext,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@ZBody(loginSchema) dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { refreshToken, ...rest } = await this.auth.login(dto);
    setRefreshCookie(res, cookieName(this.ctx.tenant.slug), refreshToken);
    return rest;
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const name = cookieName(this.ctx.tenant.slug);
    const { accessToken, refreshToken } = await this.auth.refresh(req.cookies?.[name]);
    setRefreshCookie(res, name, refreshToken);
    return { accessToken };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentUser() user: JwtPayload, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.sub);
    res.clearCookie(cookieName(this.ctx.tenant.slug), { path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.auth.profile(user.sub);
  }
}

@Controller('platform/auth')
export class PlatformAuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@ZBody(loginSchema) dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { refreshToken, ...rest } = await this.auth.platformLogin(dto);
    setRefreshCookie(res, 'erp_rt_platform', refreshToken);
    return rest;
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken } = await this.auth.refresh(req.cookies?.erp_rt_platform);
    setRefreshCookie(res, 'erp_rt_platform', refreshToken);
    return { accessToken };
  }

  @PlatformOnly()
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('erp_rt_platform', { path: '/' });
    return { ok: true };
  }
}
