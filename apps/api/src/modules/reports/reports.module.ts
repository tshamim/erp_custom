import { Controller, Get, Module, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { z } from 'zod';
import { ReportsService } from './reports.service';
import { Perm } from '../../auth/decorators';
import { ZodPipe } from '../../common/zod';

const date = new ZodPipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'));
const today = () => new Date().toISOString().slice(0, 10);
const optDate = new ZodPipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional());

@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('dashboard')
  dashboard() {
    return this.svc.dashboard();
  }

  @Get('trial-balance')
  @Perm('finance.report.read')
  trialBalance(@Query('asOf', optDate) asOf?: string) {
    return this.svc.trialBalance(asOf ?? today());
  }

  @Get('profit-loss')
  @Perm('finance.report.read')
  profitLoss(@Query('from', date) from: string, @Query('to', date) to: string, @Query('projectId') projectId?: string) {
    return this.svc.profitAndLoss(from, to, projectId || undefined);
  }

  @Get('balance-sheet')
  @Perm('finance.report.read')
  balanceSheet(@Query('asOf', optDate) asOf?: string) {
    return this.svc.balanceSheet(asOf ?? today());
  }

  @Get('general-ledger/:accountId')
  @Perm('finance.report.read')
  gl(@Param('accountId', ParseUUIDPipe) accountId: string, @Query('from', date) from: string, @Query('to', date) to: string) {
    return this.svc.generalLedger(accountId, from, to);
  }

  @Get('aging/:kind')
  @Perm('finance.report.read')
  aging(@Param('kind', new ZodPipe(z.enum(['ar', 'ap']))) kind: 'ar' | 'ap', @Query('asOf', optDate) asOf?: string) {
    return this.svc.aging(kind, asOf ?? today());
  }

  @Get('tax-summary')
  @Perm('finance.report.read')
  tax(@Query('from', date) from: string, @Query('to', date) to: string) {
    return this.svc.taxSummary(from, to);
  }

  @Get('stock-valuation')
  @Perm('inventory.report.read')
  stock(@Query('warehouseId') warehouseId?: string) {
    return this.svc.stockValuation(warehouseId || undefined);
  }
}

@Module({ controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
