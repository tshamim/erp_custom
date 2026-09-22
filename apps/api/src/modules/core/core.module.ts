import { Module } from '@nestjs/common';
import { asc } from 'drizzle-orm';
import { tenantSchema as t } from '@erp/db';
import { branchSchema } from '@erp/shared';
import { UsersController, RolesController, SystemController } from './core.controller';
import { UsersService, RolesService } from './users.service';
import { crudController } from '../../common/crud.factory';

const BranchesController = crudController({
  path: 'branches',
  table: t.branches,
  schema: branchSchema,
  perm: 'core.branch',
  entity: 'branch',
  search: [t.branches.code, t.branches.name],
  defaultSort: asc(t.branches.code),
});

@Module({
  controllers: [UsersController, RolesController, SystemController, BranchesController],
  providers: [UsersService, RolesService],
})
export class CoreModule {}
