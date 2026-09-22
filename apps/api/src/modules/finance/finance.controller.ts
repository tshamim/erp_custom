import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  accountSchema,
  AccountDto,
  bankAccountSchema,
  billSchema,
  BillDto,
  invoiceSchema,
  InvoiceDto,
  journalEntrySchema,
  JournalEntryDto,
  listQuerySchema,
  ListQuery,
  partySchema,
  PartyDto,
  paymentSchema,
  PaymentDto,
  zx,
} from '@erp/shared';
import { AccountsService, JournalService } from './accounts.service';
import { BillsService, InvoicesService, PartiesService, PaymentsService } from './documents.service';
import { BankService } from './bank.service';
import { Perm } from '../../auth/decorators';
import { ZBody, ZodPipe, ZQuery } from '../../common/zod';

const postFlag = new ZodPipe(z.enum(['true', 'false']).default('false').transform((v) => v === 'true'));

@Controller('accounts')
export class AccountsController {
  constructor(private readonly svc: AccountsService) {}

  @Get()
  @Perm('finance.account.read')
  list(@Query('asOf') asOf?: string) {
    return this.svc.list(asOf || undefined);
  }

  @Post()
  @Perm('finance.account.create')
  create(@ZBody(accountSchema) dto: AccountDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @Perm('finance.account.update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(accountSchema.partial())) dto: Partial<AccountDto>) {
    return this.svc.update(id, dto);
  }

  @Get('mappings')
  @Perm('finance.account.read')
  mappings() {
    return this.svc.mappings();
  }

  @Put('mappings/:key')
  @Perm('finance.account.update')
  setMapping(@Param('key') key: string, @ZBody(z.object({ accountId: zx.uuid })) dto: { accountId: string }) {
    return this.svc.setMapping(key, dto.accountId);
  }
}

@Controller('fiscal-years')
export class FiscalController {
  constructor(private readonly svc: AccountsService) {}

  @Get()
  @Perm('finance.fiscal.read')
  list() {
    return this.svc.fiscalYears();
  }

  @Post()
  @Perm('finance.fiscal.create')
  createNext() {
    return this.svc.createNextFiscalYear();
  }

  @Post('periods/:id/lock')
  @Perm('finance.fiscal.update')
  lock(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.setPeriodLock(id, true);
  }

  @Post('periods/:id/unlock')
  @Perm('finance.fiscal.update')
  unlock(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.setPeriodLock(id, false);
  }
}

@Controller('journals')
export class JournalsController {
  constructor(private readonly svc: JournalService) {}

  @Get()
  @Perm('finance.journal.read')
  list(@ZQuery(listQuerySchema) q: ListQuery) {
    return this.svc.list(q);
  }

  @Get(':id')
  @Perm('finance.journal.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(id);
  }

  @Post()
  @Perm('finance.journal.create')
  create(@ZBody(journalEntrySchema) dto: JournalEntryDto, @Query('post', postFlag) post: boolean) {
    return this.svc.create(dto, post);
  }

  @Post(':id/post')
  @Perm('finance.journal.post')
  post(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.postDraft(id);
  }

  @Post(':id/reverse')
  @Perm('finance.journal.post')
  reverse(@Param('id', ParseUUIDPipe) id: string, @Body() body: { date?: string }) {
    return this.svc.reverse(id, body?.date);
  }

  @Delete(':id')
  @Perm('finance.journal.delete')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deleteDraft(id);
  }
}

@Controller('parties')
export class PartiesController {
  constructor(private readonly svc: PartiesService) {}

  @Get()
  @Perm('finance.party.read')
  list(@ZQuery(listQuerySchema) q: ListQuery) {
    return this.svc.list(q);
  }

  @Get(':id')
  @Perm('finance.party.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(id);
  }

  @Get(':id/statement')
  @Perm('finance.party.read')
  statement(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.statement(id);
  }

  @Post()
  @Perm('finance.party.create')
  create(@ZBody(partySchema) dto: PartyDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @Perm('finance.party.update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(partySchema.partial())) dto: Partial<PartyDto>) {
    return this.svc.update(id, dto);
  }
}

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly svc: InvoicesService) {}

  @Get()
  @Perm('finance.invoice.read')
  list(@ZQuery(listQuerySchema) q: ListQuery) {
    return this.svc.list(q);
  }

  @Get(':id')
  @Perm('finance.invoice.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(id);
  }

  @Post()
  @Perm('finance.invoice.create')
  create(@ZBody(invoiceSchema) dto: InvoiceDto, @Query('post', postFlag) post: boolean) {
    return this.svc.create(dto, post);
  }

  @Post(':id/post')
  @Perm('finance.invoice.create')
  post(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.post(id);
  }

  @Post(':id/cancel')
  @Perm('finance.invoice.delete')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.cancel(id);
  }
}

@Controller('bills')
export class BillsController {
  constructor(private readonly svc: BillsService) {}

  @Get()
  @Perm('finance.bill.read')
  list(@ZQuery(listQuerySchema) q: ListQuery) {
    return this.svc.list(q);
  }

  @Get(':id')
  @Perm('finance.bill.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(id);
  }

  @Post()
  @Perm('finance.bill.create')
  create(@ZBody(billSchema) dto: BillDto, @Query('post', postFlag) post: boolean) {
    return this.svc.create(dto, post);
  }

  @Post('from-receipt/:receiptId')
  @Perm('finance.bill.create')
  fromReceipt(@Param('receiptId', ParseUUIDPipe) receiptId: string) {
    return this.svc.fromGoodsReceipt(receiptId);
  }

  @Post(':id/post')
  @Perm('finance.bill.create')
  post(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.post(id);
  }

  @Post(':id/cancel')
  @Perm('finance.bill.delete')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.cancel(id);
  }
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  @Get()
  @Perm('finance.payment.read')
  list(@ZQuery(listQuerySchema) q: ListQuery) {
    return this.svc.list(q);
  }

  @Get('open-documents')
  @Perm('finance.payment.read')
  open(@Query('partyId', ParseUUIDPipe) partyId: string, @Query('direction') direction: 'in' | 'out') {
    return this.svc.openDocuments(partyId, direction === 'in' ? 'in' : 'out');
  }

  @Get(':id')
  @Perm('finance.payment.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(id);
  }

  @Post()
  @Perm('finance.payment.create')
  create(@ZBody(paymentSchema) dto: PaymentDto) {
    return this.svc.create(dto);
  }

  @Post(':id/cancel')
  @Perm('finance.payment.delete')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.cancel(id);
  }
}

const statementLinesSchema = z.object({
  lines: z.array(z.object({ date: zx.isoDate, description: z.string().nullish(), reference: z.string().nullish(), amount: zx.decimal })).min(1),
});

@Controller('bank-accounts')
export class BankController {
  constructor(private readonly svc: BankService) {}

  @Get()
  @Perm('finance.payment.read')
  list() {
    return this.svc.list();
  }

  @Post()
  @Perm('finance.account.create')
  create(@ZBody(bankAccountSchema) dto: z.infer<typeof bankAccountSchema>) {
    return this.svc.create(dto);
  }

  @Get(':id/reconciliation')
  @Perm('finance.payment.read')
  reconciliation(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.reconciliation(id);
  }

  @Post(':id/statement-lines')
  @Perm('finance.payment.update')
  addLines(@Param('id', ParseUUIDPipe) id: string, @ZBody(statementLinesSchema) dto: z.infer<typeof statementLinesSchema>) {
    return this.svc.addStatementLines(id, dto.lines);
  }

  @Post('statement-lines/:lineId/match')
  @Perm('finance.payment.update')
  match(@Param('lineId', ParseUUIDPipe) lineId: string, @ZBody(z.object({ journalLineId: zx.uuid })) dto: { journalLineId: string }) {
    return this.svc.match(lineId, dto.journalLineId);
  }
}
