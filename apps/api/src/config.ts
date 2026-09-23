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
  impersonationTtlSeconds: 60 * 60,
  minio: {
    endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
    port: Number(process.env.MINIO_PORT ?? 9010),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY ?? 'erp',
    secretKey: process.env.MINIO_SECRET_KEY ?? 'erp_dev_password',
    bucket: process.env.MINIO_BUCKET ?? 'erp-attachments',
  },
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024,
  /** Hostname labels that are never treated as a tenant subdomain. */
  reservedSubdomains: new Set(['www', 'api', 'app', 'localhost', 'platform']),
};
