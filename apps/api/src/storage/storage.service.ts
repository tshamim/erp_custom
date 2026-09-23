import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Client } from 'minio';
import type { Readable } from 'stream';
import { config } from '../config';

/** Thin wrapper over MinIO / S3. Objects are namespaced by tenant slug: `<slug>/<entity>/<entityId>/<file>`. */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client = new Client({
    endPoint: config.minio.endPoint,
    port: config.minio.port,
    useSSL: config.minio.useSSL,
    accessKey: config.minio.accessKey,
    secretKey: config.minio.secretKey,
  });
  readonly bucket = config.minio.bucket;

  async onModuleInit() {
    try {
      if (!(await this.client.bucketExists(this.bucket))) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`created bucket ${this.bucket}`);
      }
    } catch (e) {
      // Don't block API startup; uploads will fail with a clear error until storage is reachable.
      this.logger.error(`object storage unavailable: ${(e as Error).message}`);
    }
  }

  async put(key: string, body: Buffer, mimeType: string) {
    await this.client.putObject(this.bucket, key, body, body.length, { 'Content-Type': mimeType });
  }

  get(key: string): Promise<Readable> {
    return this.client.getObject(this.bucket, key);
  }

  async remove(key: string) {
    await this.client.removeObject(this.bucket, key);
  }
}
