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
    region: process.env.MINIO_REGION ?? 'us-east-1',
  },
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024,
  mail: {
    /** "mailtrap" sends; anything else only logs what would have been sent. */
    provider: process.env.MAIL_PROVIDER ?? (process.env.MAILTRAP_API_TOKEN ? 'mailtrap' : 'log'),
    token: process.env.MAILTRAP_API_TOKEN ?? '',
    /** Set for a Mailtrap testing inbox; leave empty to send for real from a verified domain. */
    inboxId: process.env.MAILTRAP_INBOX_ID ?? '',
    apiUrl: process.env.MAILTRAP_API_URL ?? '',
    from: {
      email: process.env.MAIL_FROM ?? 'no-reply@eclecticerp.app',
      name: process.env.MAIL_FROM_NAME ?? 'Eclectic ERP',
    },
    replyTo: process.env.MAIL_REPLY_TO || undefined,
    brand: process.env.BRAND_NAME ?? 'Eclectic ERP',
    /** Where links in emails point. */
    appUrl: process.env.APP_URL ?? (process.env.WEB_ORIGIN ?? 'http://localhost:3100').split(',')[0],
    /** Minimum gap between two sends; free Mailtrap inboxes allow about one per second. */
    minIntervalMs: Number(process.env.MAIL_MIN_INTERVAL_MS ?? 2000),
    /** Companies reachable at <slug>.yourdomain — links then carry the subdomain. */
    useSubdomains: process.env.MAIL_TENANT_SUBDOMAINS === 'true',
  },
  /** Hostname labels that are never treated as a tenant subdomain. */
  reservedSubdomains: new Set(['www', 'api', 'app', 'localhost', 'platform']),
};
