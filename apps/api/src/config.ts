import path from 'path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(__dirname, '../../../.env') });

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.API_PORT ?? 4100),
  webOrigin: (process.env.WEB_ORIGIN ?? 'http://localhost:3100').split(','),
  controlDatabaseUrl: required('CONTROL_DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  accessTokenTtlSeconds: 15 * 60,
  refreshTokenTtlDays: 7,
  tenantPoolMax: Number(process.env.TENANT_POOL_MAX ?? 50),
  /** Hostname labels that are never treated as a tenant subdomain. */
  reservedSubdomains: new Set(['www', 'api', 'app', 'localhost', 'platform']),
};
