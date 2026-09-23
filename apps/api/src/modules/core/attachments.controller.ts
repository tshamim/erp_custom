import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { randomUUID } from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { tenantSchema as t } from '@erp/db';
import { Perm } from '../../auth/decorators';
import { ZodPipe } from '../../common/zod';
import { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../../common/audit.service';
import { StorageService } from '../../storage/storage.service';
import { config } from '../../config';

const ALLOWED = /^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/csv|text\/plain|application\/vnd\.(ms-excel|openxmlformats-officedocument\.[a-z.]+)|application\/msword|application\/zip|application\/x-zip-compressed)$/;
const refSchema = z.object({ entity: z.string().regex(/^[a-z_]{2,50}$/), entityId: z.string().uuid() });

/** File attachments on any record, stored in MinIO under the tenant's prefix. */
@Controller('attachments')
export class AttachmentsController {
  constructor(
    private readonly ctx: TenantContext,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  @Perm('core.attachment.read')
  list(@Query(new ZodPipe(refSchema)) q: z.infer<typeof refSchema>) {
    return this.ctx.db
      .select({
        id: t.attachments.id,
        fileName: t.attachments.fileName,
        mimeType: t.attachments.mimeType,
        size: t.attachments.size,
        createdAt: t.attachments.createdAt,
        uploadedBy: t.users.name,
      })
      .from(t.attachments)
      .leftJoin(t.users, eq(t.users.id, t.attachments.uploadedBy))
      .where(and(eq(t.attachments.entity, q.entity), eq(t.attachments.entityId, q.entityId)))
      .orderBy(desc(t.attachments.createdAt));
  }

  @Post()
  @Perm('core.attachment.create')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: config.maxUploadBytes } }))
  async upload(@UploadedFile() file: Express.Multer.File | undefined, @Query(new ZodPipe(refSchema)) q: z.infer<typeof refSchema>) {
    if (!file) throw new BadRequestException('No file uploaded (field name "file")');
    if (!ALLOWED.test(file.mimetype)) throw new BadRequestException(`File type ${file.mimetype} is not allowed`);
    const safe = file.originalname.replace(/[^\w.\- ]+/g, '_').slice(-150);
    const key = `${this.ctx.tenant.slug}/${q.entity}/${q.entityId}/${randomUUID()}-${safe}`;
    await this.storage.put(key, file.buffer, file.mimetype);
    const [row] = await this.ctx.db
      .insert(t.attachments)
      .values({ entity: q.entity, entityId: q.entityId, fileName: file.originalname.slice(0, 255), mimeType: file.mimetype, size: file.size, storageKey: key, uploadedBy: this.ctx.userId })
      .returning();
    await this.audit.log('upload', q.entity, q.entityId, null, { file: row.fileName, size: row.size });
    const { storageKey: _internal, ...visible } = row;
    return visible;
  }

  private async find(id: string) {
    const [row] = await this.ctx.db.select().from(t.attachments).where(eq(t.attachments.id, id));
    // Keys are always under the tenant prefix; double-check so a tampered row can't read another tenant's objects.
    if (!row || !row.storageKey.startsWith(`${this.ctx.tenant.slug}/`)) throw new NotFoundException();
    return row;
  }

  @Get(':id/download')
  @Perm('core.attachment.read')
  async download(@Param('id', ParseUUIDPipe) id: string, @Query('inline') inline: string | undefined, @Res() res: Response) {
    const row = await this.find(id);
    const stream = await this.storage.get(row.storageKey);
    res.setHeader('Content-Type', row.mimeType ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `${inline === '1' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.fileName)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    stream.pipe(res);
  }

  @Delete(':id')
  @Perm('core.attachment.delete')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const row = await this.find(id);
    await this.storage.remove(row.storageKey);
    await this.ctx.db.delete(t.attachments).where(eq(t.attachments.id, id));
    await this.audit.log('delete', 'attachment', id, { file: row.fileName, entity: row.entity, entityId: row.entityId }, null);
    return { ok: true };
  }
}
