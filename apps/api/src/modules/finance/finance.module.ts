import { Module } from '@nestjs/common';
import { asc } from 'drizzle-orm';
import { tenantSchema as t } from '@erp/db';
import { taxCodeSchema } from '@erp/shared';
import { crudController } from '../../common/crud.factory';
import { AccountsService, JournalService } from './accounts.service';
import { BillsService, InvoicesService, PartiesService, PaymentsService } from './documents.service';
import { BankService } from './bank.service';
import {
  AccountsController,
  BankController,
  BillsController,
  FiscalController,
  InvoicesController,
  JournalsController,
  PartiesController,
  PaymentsController,
} from './finance.controller';

const TaxCodesController = crudController({
  path: 'tax-codes',
  table: t.taxCodes,
  schema: taxCodeSchema,
  perm: 'finance.account',
  entity: 'tax_code',
  search: [t.taxCodes.code, t.taxCodes.name],
  defaultSort: asc(t.taxCodes.code),
});

@Module({
  controllers: [
    AccountsController,
    FiscalController,
    JournalsController,
    PartiesController,
    InvoicesController,
    BillsController,
    PaymentsController,
    BankController,
    TaxCodesController,
  ],
  providers: [AccountsService, JournalService, PartiesService, InvoicesService, BillsService, PaymentsService, BankService],
  exports: [InvoicesService, BillsService, PartiesService],
})
export class FinanceModule {}
