import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { createControlDb, ControlDb } from '@erp/db';
import { config } from '../config';

export const CONTROL_DB = Symbol('CONTROL_DB');
const CONTROL_POOL = Symbol('CONTROL_POOL');

const control = { instance: null as null | ReturnType<typeof createControlDb> };
const getControl = () => (control.instance ??= createControlDb(config.controlDatabaseUrl));

@Global()
@Module({
  providers: [
    { provide: CONTROL_POOL, useFactory: () => getControl().pool },
    { provide: CONTROL_DB, useFactory: () => getControl().db },
  ],
  exports: [CONTROL_DB],
})
export class ControlModule implements OnApplicationShutdown {
  constructor(@Inject(CONTROL_POOL) private readonly pool: Pool) {}
  async onApplicationShutdown() {
    await this.pool.end();
  }
}

export type { ControlDb };
