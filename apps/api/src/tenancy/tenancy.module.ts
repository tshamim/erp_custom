import { Global, Module } from '@nestjs/common';
import { TenantConnectionService } from './tenant-connection.service';
import { TenantContext } from './tenant-context';
import { TenantMiddleware } from './tenant.middleware';
import { TenantModulesService } from './tenant-modules.service';

@Global()
@Module({
  providers: [TenantConnectionService, TenantContext, TenantMiddleware, TenantModulesService],
  exports: [TenantConnectionService, TenantContext, TenantMiddleware, TenantModulesService],
})
export class TenancyModule {}
