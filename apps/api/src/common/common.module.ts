import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { NumberingService } from './numbering.service';
import { PostingService } from '../ledger/posting.service';
import { StockService } from '../ledger/stock.service';
import { PermissionCache } from '../auth/permission-cache.service';
import { StorageService } from '../storage/storage.service';

@Global()
@Module({
  providers: [AuditService, NumberingService, PostingService, StockService, PermissionCache, StorageService],
  exports: [AuditService, NumberingService, PostingService, StockService, PermissionCache, StorageService],
})
export class CommonModule {}
