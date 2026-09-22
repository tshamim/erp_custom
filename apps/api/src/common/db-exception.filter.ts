import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

interface PgError {
  code?: string;
  detail?: string;
  constraint?: string;
  message?: string;
  cause?: PgError;
}

const PG_MAP: Record<string, [number, string]> = {
  '23505': [HttpStatus.CONFLICT, 'A record with the same unique value already exists'],
  '23503': [HttpStatus.BAD_REQUEST, 'Referenced record does not exist or is still in use'],
  '23514': [HttpStatus.BAD_REQUEST, 'Value violates a business rule'],
  '23502': [HttpStatus.BAD_REQUEST, 'A required field is missing'],
  '22P02': [HttpStatus.BAD_REQUEST, 'Invalid value format'],
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      res.status(exception.getStatus()).json(typeof body === 'string' ? { message: body } : body);
      return;
    }
    const err = exception as PgError;
    const pg = err?.code && PG_MAP[err.code] ? err : err?.cause?.code && PG_MAP[err.cause.code] ? err.cause : null;
    if (pg?.code) {
      const [status, message] = PG_MAP[pg.code];
      res.status(status).json({ message, detail: pg.detail, constraint: pg.constraint });
      return;
    }
    this.logger.error(err?.message ?? String(exception), (exception as Error)?.stack);
    res.status(500).json({ message: 'Internal server error' });
  }
}
