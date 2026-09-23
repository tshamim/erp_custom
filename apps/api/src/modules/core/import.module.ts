import { Body, Controller, Get, Module, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { IMPORT_RESOURCES, IMPORT_TEMPLATES, ImportResource } from '@erp/shared';
import { ImportService } from './import.service';
import { ZodPipe } from '../../common/zod';
import { InventoryModule } from '../inventory/inventory.module';

const bodySchema = z.object({
  rows: z.array(z.record(z.string().optional())).min(1),
  projectId: z.string().uuid().optional(),
});

/** Permission is checked per resource inside the service (e.g. items → inventory.item.create). */
@Controller('import')
export class ImportController {
  constructor(private readonly svc: ImportService) {}

  @Get('templates')
  templates() {
    return IMPORT_TEMPLATES;
  }

  @Post(':resource')
  async run(
    @Param('resource', new ZodPipe(z.enum(IMPORT_RESOURCES as [ImportResource, ...ImportResource[]]))) resource: ImportResource,
    @Query('dryRun') dryRun: string | undefined,
    @Body(new ZodPipe(bodySchema)) body: z.infer<typeof bodySchema>,
  ) {
    await this.svc.assertProject(body.projectId);
    return this.svc.run(resource, body.rows, { dryRun: dryRun === 'true', projectId: body.projectId });
  }
}

@Module({ imports: [InventoryModule], controllers: [ImportController], providers: [ImportService] })
export class ImportModule {}
