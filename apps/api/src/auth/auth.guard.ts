import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC, JwtPayload, PERMS, PLATFORM_ONLY } from './decorators';
import { TenantContext } from '../tenancy/tenant-context';
import { PermissionCache } from './permission-cache.service';
import { config } from '../config';

/**
 * Global guard: verifies the bearer token, enforces platform vs tenant scope,
 * checks the token's tenant matches the request's tenant, then checks @Perm().
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly ctx: TenantContext,
    private readonly perms: PermissionCache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException();
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(header.slice(7), { secret: config.jwtSecret });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    req.user = payload;

    const platformOnly = this.reflector.getAllAndOverride<boolean>(PLATFORM_ONLY, targets);
    if (platformOnly) {
      if (payload.scope !== 'platform') throw new ForbiddenException('Platform admin only');
      return true;
    }
    if (payload.scope !== 'tenant') throw new ForbiddenException('Tenant user token required');
    const tenant = this.ctx.tenantOrNull;
    if (!tenant || tenant.id !== payload.tid) throw new ForbiddenException('Token does not belong to this company');
    this.ctx.setUser(payload.sub);

    const required = this.reflector.getAllAndOverride<string[]>(PERMS, targets);
    if (required?.length) {
      const granted = await this.perms.forUser(tenant.id, payload.sub, this.ctx.db);
      if (!granted.active) throw new UnauthorizedException('User is inactive');
      const missing = required.filter((p) => !granted.keys.has(p));
      if (missing.length) throw new ForbiddenException(`Missing permission: ${missing.join(', ')}`);
    }
    return true;
  }
}
