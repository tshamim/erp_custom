import { Controller, Get, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import { payrollRunSchema, PayrollRunDto, salaryStructureSchema, SalaryStructureDto, zx } from '@erp/shared';
import { PayrollService } from './payroll.service';
import { Perm } from '../../auth/decorators';
import { ZBody } from '../../common/zod';

const paySchema = z.object({ cashAccountId: zx.uuid, date: zx.isoDate });

@Controller()
export class PayrollController {
  constructor(private readonly svc: PayrollService) {}

  @Get('salary-structures')
  @Perm('payroll.structure.read')
  structures() {
    return this.svc.structures();
  }

  @Post('salary-structures')
  @Perm('payroll.structure.create')
  save(@ZBody(salaryStructureSchema) dto: SalaryStructureDto) {
    return this.svc.saveStructure(dto);
  }

  @Get('payroll-runs')
  @Perm('payroll.run.read')
  runs() {
    return this.svc.runs();
  }

  @Get('payroll-runs/:id')
  @Perm('payroll.run.read')
  run(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getRun(id);
  }

  @Post('payroll-runs')
  @Perm('payroll.run.create')
  generate(@ZBody(payrollRunSchema) dto: PayrollRunDto) {
    return this.svc.generate(dto);
  }

  @Post('payroll-runs/:id/finalize')
  @Perm('payroll.run.finalize')
  finalize(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.finalize(id);
  }

  @Post('payroll-runs/:id/pay')
  @Perm('payroll.run.finalize')
  pay(@Param('id', ParseUUIDPipe) id: string, @ZBody(paySchema) dto: z.infer<typeof paySchema>) {
    return this.svc.pay(id, dto.cashAccountId, dto.date);
  }
}

@Module({ controllers: [PayrollController], providers: [PayrollService] })
export class PayrollModule {}
