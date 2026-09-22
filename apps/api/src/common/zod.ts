import { BadRequestException, PipeTransform, Body, Query } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';

export class ZodPipe<S extends ZodTypeAny> implements PipeTransform {
  constructor(private readonly schema: S) {}
  transform(value: unknown): z.infer<S> {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return r.data;
  }
}

/** `@ZBody(schema) dto: z.infer<typeof schema>` */
export const ZBody = <S extends ZodTypeAny>(schema: S) => Body(new ZodPipe(schema));
export const ZQuery = <S extends ZodTypeAny>(schema: S) => Query(new ZodPipe(schema));
