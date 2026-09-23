import { Controller, Get, Param, ParseUUIDPipe, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { createTenantSchema, CreateTenantDto, impersonateSchema, subscriptionSchema, tenantModulesSchema } from '@erp/shared';
import { PlatformActor, PlatformService } from './platform.service';
import { CurrentUser, JwtPayload, PlatformOnly } from '../auth/decorators';
import { ZBody } from '../common/zod';

const actor = (u: JwtPayload, req: Request): PlatformActor => ({ id: u.sub, ip: req.ip });

@PlatformOnly()
@Controller('platform')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get('overview')
  overview() {
    return this.platform.overview();
  }

  @Get('audit')
  audit() {
    return this.platform.platformAudit();
  }

  @Get('tenants')
  list() {
    return this.platform.list();
  }

  @Post('tenants')
  create(@ZBody(createTenantSchema) dto: CreateTenantDto, @CurrentUser() u: JwtPayload, @Req() req: Request) {
    return this.platform.create(dto, actor(u, req));
  }

  @Post('tenants/migrate')
  migrate(@CurrentUser() u: JwtPayload, @Req() req: Request) {
    return this.platform.migrateAll(actor(u, req));
  }

  @Get('tenants/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.get(id);
  }

  @Post('tenants/:id/suspend')
  suspend(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload, @Req() req: Request) {
    return this.platform.setStatus(id, 'suspended', actor(u, req));
  }

  @Post('tenants/:id/activate')
  activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload, @Req() req: Request) {
    return this.platform.setStatus(id, 'active', actor(u, req));
  }

  @Put('tenants/:id/modules')
  modules(@Param('id', ParseUUIDPipe) id: string, @ZBody(tenantModulesSchema) dto: z.infer<typeof tenantModulesSchema>, @CurrentUser() u: JwtPayload, @Req() req: Request) {
    return this.platform.setModules(id, dto.modules, actor(u, req));
  }

  @Put('tenants/:id/subscription')
  subscription(@Param('id', ParseUUIDPipe) id: string, @ZBody(subscriptionSchema) dto: z.infer<typeof subscriptionSchema>, @CurrentUser() u: JwtPayload, @Req() req: Request) {
    return this.platform.setSubscription(id, dto, actor(u, req));
  }

  @Post('tenants/:id/impersonate')
  impersonate(@Param('id', ParseUUIDPipe) id: string, @ZBody(impersonateSchema) dto: z.infer<typeof impersonateSchema>, @CurrentUser() u: JwtPayload, @Req() req: Request) {
    return this.platform.impersonate(id, dto, actor(u, req));
  }
}
