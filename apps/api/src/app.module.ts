import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ClsModule } from 'nestjs-cls';
import { ControlModule } from './control/control.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { TenantMiddleware } from './tenancy/tenant.middleware';
import { CommonModule } from './common/common.module';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { AuthController, PlatformAuthController } from './auth/auth.controller';
import { PlatformController } from './platform/platform.controller';
import { PlatformService } from './platform/platform.service';
import { HealthController } from './health.controller';
import { CoreModule } from './modules/core/core.module';
import { HrModule } from './modules/hr/hr.module';
import { FinanceModule } from './modules/finance/finance.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ProcurementModule } from './modules/procurement/procurement.module';
import { ConstructionModule } from './modules/construction/construction.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { ReportsModule } from './modules/reports/reports.module';

@Module({
  imports: [
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    JwtModule.register({ global: true }),
    ControlModule,
    TenancyModule,
    CommonModule,
    CoreModule,
    HrModule,
    FinanceModule,
    InventoryModule,
    ProcurementModule,
    ConstructionModule,
    PayrollModule,
    ReportsModule,
  ],
  controllers: [HealthController, AuthController, PlatformAuthController, PlatformController],
  providers: [AuthService, PlatformService, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).exclude('platform/(.*)', 'health').forRoutes('*');
  }
}
