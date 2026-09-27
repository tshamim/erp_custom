import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  companyDocumentSchema,
  CompanyDocumentDto,
  DOCUMENT_CATEGORIES,
  eb3CandidateSchema,
  Eb3CandidateDto,
  eb3CaseDocumentSchema,
  Eb3CaseDocumentDto,
  eb3CaseSchema,
  Eb3CaseDto,
  eb3EmployerSchema,
  Eb3EmployerDto,
  eb3JobOrderSchema,
  Eb3JobOrderDto,
  eb3PaymentSchema,
  Eb3PaymentDto,
  eb3StageSchema,
  Eb3StageDto,
  EB3_STAGE_LIST,
  investmentAgreementSchema,
  InvestmentAgreementDto,
  investorSchema,
  InvestorDto,
  investorTransactionSchema,
  InvestorTransactionDto,
  listQuerySchema,
  profitAllocationSchema,
  ProfitAllocationDto,
  quotationSchema,
  QuotationDto,
  quotationWinSchema,
  QuotationWinDto,
  zx,
} from '@erp/shared';
import { InvestorsService } from './investors.service';
import { QuotationsService } from './quotations.service';
import { DocumentsService } from './documents.service';
import { Eb3Service } from './eb3.service';
import { Perm } from '../../auth/decorators';
import { ZBody, ZodPipe, ZQuery } from '../../common/zod';

const investorQuery = listQuerySchema.extend({ investorId: zx.uuid.optional() });
const documentQuery = listQuerySchema.extend({ category: z.string().optional() });
const caseQuery = listQuerySchema.extend({ employerId: zx.uuid.optional(), stage: z.enum(EB3_STAGE_LIST).optional() });
const eventSchema = z.object({ date: zx.isoDate, title: z.string().min(2).max(200), notes: z.string().nullish() });
const quotationStatusSchema = z.object({ status: z.enum(['sent', 'lost', 'expired', 'cancelled']), reason: z.string().nullish() });

@Controller('investors')
export class InvestorsController {
  constructor(private readonly svc: InvestorsService) {}

  @Get()
  @Perm('investor.investor.read')
  list(@ZQuery(listQuerySchema) q: z.infer<typeof listQuerySchema>) {
    return this.svc.list(q);
  }

  @Post()
  @Perm('investor.investor.create')
  create(@ZBody(investorSchema) dto: InvestorDto) {
    return this.svc.create(dto);
  }

  @Get('transactions')
  @Perm('investor.transaction.read')
  transactions(@ZQuery(investorQuery) q: z.infer<typeof investorQuery>) {
    return this.svc.transactions(q);
  }

  @Post('transactions')
  @Perm('investor.transaction.post')
  transact(@ZBody(investorTransactionSchema) dto: InvestorTransactionDto) {
    return this.svc.transact(dto);
  }

  @Get('transactions/:id')
  @Perm('investor.transaction.read')
  transaction(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getTransaction(id);
  }

  @Delete('transactions/:id')
  @Perm('investor.transaction.delete')
  cancelTransaction(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.cancelTransaction(id);
  }

  @Get('agreements')
  @Perm('investor.agreement.read')
  agreements(@ZQuery(investorQuery) q: z.infer<typeof investorQuery>) {
    return this.svc.agreements(q);
  }

  @Post('agreements')
  @Perm('investor.agreement.create')
  createAgreement(@ZBody(investmentAgreementSchema) dto: InvestmentAgreementDto) {
    return this.svc.createAgreement(dto);
  }

  @Patch('agreements/:id')
  @Perm('investor.agreement.update')
  updateAgreement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(investmentAgreementSchema.partial())) dto: Partial<InvestmentAgreementDto>,
  ) {
    return this.svc.updateAgreement(id, dto);
  }

  /** Who is owed what out of a project's profit for a period, before anything is booked. */
  @Get('projects/:projectId/entitlements')
  @Perm('investor.report.read')
  entitlements(@Param('projectId', ParseUUIDPipe) projectId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.entitlements(projectId, from || undefined, to || undefined);
  }

  @Post('allocate-profit')
  @Perm('investor.transaction.post')
  allocate(@ZBody(profitAllocationSchema) dto: ProfitAllocationDto) {
    return this.svc.allocateProfit(dto);
  }

  @Get(':id/statement')
  @Perm('investor.report.read')
  statement(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.statement(id);
  }

  @Patch(':id')
  @Perm('investor.investor.update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(investorSchema.partial())) dto: Partial<InvestorDto>) {
    return this.svc.update(id, dto);
  }
}

@Controller('quotations')
export class QuotationsController {
  constructor(private readonly svc: QuotationsService) {}

  @Get()
  @Perm('quotation.quotation.read')
  list(@ZQuery(listQuerySchema) q: z.infer<typeof listQuerySchema>) {
    return this.svc.list(q);
  }

  @Post()
  @Perm('quotation.quotation.create')
  create(@ZBody(quotationSchema) dto: QuotationDto) {
    return this.svc.create(dto);
  }

  @Get(':id')
  @Perm('quotation.quotation.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(id);
  }

  @Patch(':id')
  @Perm('quotation.quotation.update')
  update(@Param('id', ParseUUIDPipe) id: string, @ZBody(quotationSchema) dto: QuotationDto) {
    return this.svc.update(id, dto);
  }

  @Post(':id/status')
  @Perm('quotation.quotation.update')
  setStatus(@Param('id', ParseUUIDPipe) id: string, @ZBody(quotationStatusSchema) dto: z.infer<typeof quotationStatusSchema>) {
    return this.svc.setStatus(id, dto.status, dto.reason);
  }

  /** Won — creates the project and copies the quoted lines into its BOQ. */
  @Post(':id/win')
  @Perm('quotation.quotation.approve')
  win(@Param('id', ParseUUIDPipe) id: string, @ZBody(quotationWinSchema) dto: QuotationWinDto) {
    return this.svc.win(id, dto);
  }
}

@Controller('company-documents')
export class CompanyDocumentsController {
  constructor(private readonly svc: DocumentsService) {}

  @Get()
  @Perm('document.document.read')
  list(@ZQuery(documentQuery) q: z.infer<typeof documentQuery>) {
    return this.svc.list(q);
  }

  @Get('categories')
  @Perm('document.document.read')
  categories() {
    return DOCUMENT_CATEGORIES;
  }

  @Get('expiring')
  @Perm('document.document.read')
  expiring() {
    return this.svc.expiring();
  }

  @Get('gallery')
  @Perm('document.document.read')
  gallery(@Query('entity') entity?: string, @Query('entityId') entityId?: string, @Query('limit') limit?: string) {
    return this.svc.gallery({ entity, entityId, limit: limit ? Number(limit) : undefined });
  }

  @Post()
  @Perm('document.document.create')
  create(@ZBody(companyDocumentSchema) dto: CompanyDocumentDto) {
    return this.svc.create(dto);
  }

  @Get(':id')
  @Perm('document.document.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(id);
  }

  @Patch(':id')
  @Perm('document.document.update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(companyDocumentSchema.partial())) dto: Partial<CompanyDocumentDto>) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Perm('document.document.delete')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.remove(id);
  }
}

@Controller('eb3')
export class Eb3Controller {
  constructor(private readonly svc: Eb3Service) {}

  // ---- employers ----
  @Get('employers')
  @Perm('eb3.employer.read')
  employers(@ZQuery(listQuerySchema) q: z.infer<typeof listQuerySchema>) {
    return this.svc.employers(q);
  }

  @Post('employers')
  @Perm('eb3.employer.create')
  createEmployer(@ZBody(eb3EmployerSchema) dto: Eb3EmployerDto) {
    return this.svc.createEmployer(dto);
  }

  @Patch('employers/:id')
  @Perm('eb3.employer.update')
  updateEmployer(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(eb3EmployerSchema.partial())) dto: Partial<Eb3EmployerDto>) {
    return this.svc.updateEmployer(id, dto);
  }

  // ---- job orders ----
  @Get('job-orders')
  @Perm('eb3.joborder.read')
  jobOrders(@ZQuery(listQuerySchema) q: z.infer<typeof listQuerySchema>) {
    return this.svc.jobOrders(q);
  }

  @Post('job-orders')
  @Perm('eb3.joborder.create')
  createJobOrder(@ZBody(eb3JobOrderSchema) dto: Eb3JobOrderDto) {
    return this.svc.createJobOrder(dto);
  }

  @Patch('job-orders/:id')
  @Perm('eb3.joborder.update')
  updateJobOrder(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(eb3JobOrderSchema.partial())) dto: Partial<Eb3JobOrderDto>) {
    return this.svc.updateJobOrder(id, dto);
  }

  // ---- candidates ----
  @Get('candidates')
  @Perm('eb3.candidate.read')
  candidates(@ZQuery(listQuerySchema) q: z.infer<typeof listQuerySchema>) {
    return this.svc.candidates(q);
  }

  @Post('candidates')
  @Perm('eb3.candidate.create')
  createCandidate(@ZBody(eb3CandidateSchema) dto: Eb3CandidateDto) {
    return this.svc.createCandidate(dto);
  }

  @Get('candidates/:id')
  @Perm('eb3.candidate.read')
  candidate(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.candidate(id);
  }

  @Patch('candidates/:id')
  @Perm('eb3.candidate.update')
  updateCandidate(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(eb3CandidateSchema.partial())) dto: Partial<Eb3CandidateDto>) {
    return this.svc.updateCandidate(id, dto);
  }

  // ---- cases ----
  @Get('cases')
  @Perm('eb3.case.read')
  cases(@ZQuery(caseQuery) q: z.infer<typeof caseQuery>) {
    return this.svc.cases(q);
  }

  @Get('pipeline')
  @Perm('eb3.case.read')
  pipeline() {
    return this.svc.pipeline();
  }

  @Get('stages')
  @Perm('eb3.case.read')
  stages() {
    return EB3_STAGE_LIST;
  }

  @Post('cases')
  @Perm('eb3.case.create')
  createCase(@ZBody(eb3CaseSchema) dto: Eb3CaseDto) {
    return this.svc.createCase(dto);
  }

  @Get('cases/:id')
  @Perm('eb3.case.read')
  case(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.case(id);
  }

  @Patch('cases/:id')
  @Perm('eb3.case.update')
  updateCase(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(eb3CaseSchema.partial().extend({ status: z.string().optional() }))) dto: Partial<Eb3CaseDto>) {
    return this.svc.updateCase(id, dto);
  }

  @Post('cases/:id/advance')
  @Perm('eb3.case.advance')
  advance(@Param('id', ParseUUIDPipe) id: string, @ZBody(eb3StageSchema) dto: Eb3StageDto) {
    return this.svc.advance(id, dto);
  }

  @Post('cases/:id/events')
  @Perm('eb3.case.update')
  addEvent(@Param('id', ParseUUIDPipe) id: string, @ZBody(eventSchema) dto: z.infer<typeof eventSchema>) {
    return this.svc.addEvent(id, dto);
  }

  // ---- checklist ----
  @Post('case-documents')
  @Perm('eb3.case.update')
  addDocument(@ZBody(eb3CaseDocumentSchema) dto: Eb3CaseDocumentDto) {
    return this.svc.addDocument(dto);
  }

  @Patch('case-documents/:id')
  @Perm('eb3.case.update')
  updateDocument(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(eb3CaseDocumentSchema.partial())) dto: Partial<Eb3CaseDocumentDto>) {
    return this.svc.updateDocument(id, dto);
  }

  @Delete('case-documents/:id')
  @Perm('eb3.case.update')
  removeDocument(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.removeDocument(id);
  }

  // ---- fees ----
  @Get('payments')
  @Perm('eb3.payment.read')
  payments(@ZQuery(listQuerySchema) q: z.infer<typeof listQuerySchema>) {
    return this.svc.payments(q);
  }

  @Post('payments')
  @Perm('eb3.payment.create')
  pay(@ZBody(eb3PaymentSchema) dto: Eb3PaymentDto) {
    return this.svc.pay(dto);
  }
}
