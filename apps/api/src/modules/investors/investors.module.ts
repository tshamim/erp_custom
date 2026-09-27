import { Module } from '@nestjs/common';
import { InvestorsService } from './investors.service';
import { QuotationsService } from './quotations.service';
import { DocumentsService } from './documents.service';
import { Eb3Service } from './eb3.service';
import { CompanyDocumentsController, Eb3Controller, InvestorsController, QuotationsController } from './investors.controller';

/** Investors & profit sharing, quotations, company documents and EB-3 case processing. */
@Module({
  controllers: [InvestorsController, QuotationsController, CompanyDocumentsController, Eb3Controller],
  providers: [InvestorsService, QuotationsService, DocumentsService, Eb3Service],
})
export class InvestorsModule {}
