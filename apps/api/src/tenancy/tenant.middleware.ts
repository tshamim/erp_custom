import { ForbiddenException, Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { TenantConnectionService } from './tenant-connection.service';
import { CLS } from './tenant-context';
import { config } from '../config';

/** acme.erp.example.com → "acme"; acme.localhost → "acme"; localhost → null */
export function slugFromHost(host: string | undefined): string | null {
  if (!host) return null;
  const hostname = host.split(':')[0].toLowerCase();
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return null;
  const labels = hostname.split('.');
  if (labels.length < 2) return null;
  const first = labels[0];
  return config.reservedSubdomains.has(first) ? null : first;
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly connections: TenantConnectionService,
    private readonly cls: ClsService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    this.cls.set(CLS.ip, req.ip);
    const header = req.headers['x-tenant'];
    const slug = (typeof header === 'string' && header.trim().toLowerCase()) || slugFromHost(req.headers.host);
    if (!slug) return next();

    const tenant = await this.connections.lookup(slug);
    if (!tenant) return next(new NotFoundException(`Unknown company "${slug}"`));
    if (tenant.status !== 'active') return next(new ForbiddenException(`Company "${slug}" is ${tenant.status}`));

    const conn = await this.connections.get(slug);
    if (!conn) return next(new ForbiddenException(`Company "${slug}" database unavailable`));
    this.cls.set(CLS.tenant, conn.tenant);
    this.cls.set(CLS.tenantDb, conn.db);
    next();
  }
}
