import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Readable } from 'stream';
import { config } from '../config';

/**
 * Object storage for attachments. Speaks S3, so it works against MinIO locally and against
 * S3-compatible storage in production. Objects are namespaced by tenant slug:
 * `<slug>/<entity>/<entityId>/<file>`.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client = new S3Client({
    endpoint: `${config.minio.useSSL ? 'https' : 'http'}://${config.minio.endPoint}:${config.minio.port}`,
    region: config.minio.region,
    credentials: { accessKeyId: config.minio.accessKey, secretAccessKey: config.minio.secretKey },
    // MinIO serves buckets as a path, not a subdomain.
    forcePathStyle: true,
  });
  readonly bucket = config.minio.bucket;

  async onModuleInit() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`created bucket ${this.bucket}`);
      } catch (e) {
        // Don't block API startup; uploads fail with a clear error until storage is reachable.
        this.logger.error(`object storage unavailable: ${(e as Error).message}`);
      }
    }
  }

  async put(key: string, body: Buffer, mimeType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: mimeType, ContentLength: body.length }));
  }

  async get(key: string): Promise<Readable> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return res.Body as Readable;
  }

  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
