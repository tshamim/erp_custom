import { Global, Module } from '@nestjs/common';
import { TenantConnectionService } from './tenant-connection.service';
import { TenantContext } from './tenant-context';
import { TenantMiddleware } from './tenant.middleware';

@Global()
@Module({
  providers: [TenantConnectionService, TenantContext, TenantMiddleware],
  exports: [TenantConnectionService, TenantContext, TenantMiddleware],
})
export class TenancyModule {}
