import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@erp/shared';

export const IS_PUBLIC = 'isPublic';
export const PLATFORM_ONLY = 'platformOnly';
export const PERMS = 'perms';

/** Skip authentication. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Requires a platform-admin token (not a tenant user). */
export const PlatformOnly = () => SetMetadata(PLATFORM_ONLY, true);
/** Requires ALL listed permissions. */
export const Perm = (...perms: Permission[]) => SetMetadata(PERMS, perms);

export interface JwtPayload {
  sub: string;
  scope: 'tenant' | 'platform';
  tid?: string;
  name?: string;
  /** Set when a platform admin is acting inside a tenant ("login as tenant"). */
  imp?: { id: string; email: string };
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): JwtPayload => {
  return ctx.switchToHttp().getRequest().user;
});
