import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { NumberingService } from './numbering.service';
import { PostingService } from '../ledger/posting.service';
import { StockService } from '../ledger/stock.service';
import { PermissionCache } from '../auth/permission-cache.service';

@Global()
@Module({
  providers: [AuditService, NumberingService, PostingService, StockService, PermissionCache],
  exports: [AuditService, NumberingService, PostingService, StockService, PermissionCache],
})
export class CommonModule {}
