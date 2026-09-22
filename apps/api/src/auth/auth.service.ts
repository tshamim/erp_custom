import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq, sql } from 'drizzle-orm';
import { verify } from '@node-rs/argon2';
import { controlSchema, tenantSchema as t } from '@erp/db';
import type { LoginDto } from '@erp/shared';
import { CONTROL_DB, ControlDb } from '../control/control.module';
import { TenantContext } from '../tenancy/tenant-context';
import { AuditService } from '../common/audit.service';
import { PermissionCache } from './permission-cache.service';
import type { JwtPayload } from './decorators';
import { config } from '../config';

interface RefreshPayload extends JwtPayload {
  ver: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly ctx: TenantContext,
    private readonly audit: AuditService,
    private readonly perms: PermissionCache,
    @Inject(CONTROL_DB) private readonly control: ControlDb,
  ) {}

  private async issue(payload: JwtPayload, ver: number) {
    const accessToken = await this.jwt.signAsync(payload, { secret: config.jwtSecret, expiresIn: config.accessTokenTtlSeconds });
    const refreshToken = await this.jwt.signAsync(
      { ...payload, ver } satisfies RefreshPayload,
      { secret: config.jwtRefreshSecret, expiresIn: config.refreshTokenTtlDays * 86_400 },
    );
    return { accessToken, refreshToken };
  }

  async login(dto: LoginDto) {
    const db = this.ctx.db;
    const tenant = this.ctx.tenant;
    const [user] = await db.select().from(t.users).where(eq(t.users.email, dto.email.toLowerCase()));
    if (!user || !user.isActive || !(await verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    await db.update(t.users).set({ lastLoginAt: new Date() }).where(eq(t.users.id, user.id));
    this.ctx.setUser(user.id);
    await this.audit.log('login', 'user', user.id);
    const tokens = await this.issue({ sub: user.id, scope: 'tenant', tid: tenant.id, name: user.name }, user.tokenVersion);
    return { ...tokens, profile: await this.profile(user.id) };
  }

  async profile(userId: string) {
    const db = this.ctx.db;
    const tenant = this.ctx.tenant;
    const [user] = await db
      .select({ id: t.users.id, name: t.users.name, email: t.users.email, branchId: t.users.branchId })
      .from(t.users)
      .where(eq(t.users.id, userId));
    if (!user) throw new UnauthorizedException();
    const roleRows = await db
      .select({ name: t.roles.name })
      .from(t.userRoles)
      .innerJoin(t.roles, eq(t.roles.id, t.userRoles.roleId))
      .where(eq(t.userRoles.userId, userId));
    const granted = await this.perms.forUser(tenant.id, userId, db);
    return {
      user,
      roles: roleRows.map((r) => r.name),
      permissions: [...granted.keys].sort(),
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    };
  }

  async refresh(token: string | undefined) {
    if (!token) throw new UnauthorizedException('No refresh token');
    let p: RefreshPayload;
    try {
      p = await this.jwt.verifyAsync<RefreshPayload>(token, { secret: config.jwtRefreshSecret });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (p.scope === 'platform') {
      const [admin] = await this.control
        .select()
        .from(controlSchema.platformAdmins)
        .where(eq(controlSchema.platformAdmins.id, p.sub));
      if (!admin?.isActive) throw new UnauthorizedException();
      return this.issue({ sub: admin.id, scope: 'platform', name: admin.name }, 0);
    }
    const tenant = this.ctx.tenant;
    if (p.tid !== tenant.id) throw new UnauthorizedException('Refresh token belongs to another company');
    const [user] = await this.ctx.db.select().from(t.users).where(eq(t.users.id, p.sub));
    if (!user?.isActive || user.tokenVersion !== p.ver) throw new UnauthorizedException('Session revoked');
    return this.issue({ sub: user.id, scope: 'tenant', tid: tenant.id, name: user.name }, user.tokenVersion);
  }

  /** Revokes all refresh tokens of the user. */
  async logout(userId: string) {
    await this.ctx.db
      .update(t.users)
      .set({ tokenVersion: sql`${t.users.tokenVersion} + 1` })
      .where(eq(t.users.id, userId));
  }

  async platformLogin(dto: LoginDto) {
    const [admin] = await this.control
      .select()
      .from(controlSchema.platformAdmins)
      .where(eq(controlSchema.platformAdmins.email, dto.email.toLowerCase()));
    if (!admin || !admin.isActive || !(await verify(admin.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const tokens = await this.issue({ sub: admin.id, scope: 'platform', name: admin.name }, 0);
    return { ...tokens, profile: { user: { id: admin.id, name: admin.name, email: admin.email } } };
  }
}
