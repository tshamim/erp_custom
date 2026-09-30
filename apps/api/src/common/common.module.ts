import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { NumberingService } from './numbering.service';
import { PostingService } from '../ledger/posting.service';
import { StockService } from '../ledger/stock.service';
import { PermissionCache } from '../auth/permission-cache.service';
import { StorageService } from '../storage/storage.service';
import { MailService } from '../mail/mail.service';

@Global()
@Module({
  providers: [AuditService, NumberingService, PostingService, StockService, PermissionCache, StorageService, MailService],
  exports: [AuditService, NumberingService, PostingService, StockService, PermissionCache, StorageService, MailService],
})
export class CommonModule {}
