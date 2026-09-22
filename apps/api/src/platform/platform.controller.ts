import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { createTenantSchema, CreateTenantDto } from '@erp/shared';
import { PlatformService } from './platform.service';
import { PlatformOnly } from '../auth/decorators';
import { ZBody } from '../common/zod';

@PlatformOnly()
@Controller('platform/tenants')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get()
  list() {
    return this.platform.list();
  }

  @Post()
  create(@ZBody(createTenantSchema) dto: CreateTenantDto) {
    return this.platform.create(dto);
  }

  @Post('migrate')
  migrate() {
    return this.platform.migrateAll();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.get(id);
  }

  @Post(':id/suspend')
  suspend(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.setStatus(id, 'suspended');
  }

  @Post(':id/activate')
  activate(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.setStatus(id, 'active');
  }
}
