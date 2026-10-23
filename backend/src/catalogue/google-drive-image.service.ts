import { basename } from 'node:path';
import { Readable } from 'node:stream';
import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 15_000;
const FILE_ID_PATTERN = /^[A-Za-z0-9_-]{10,200}$/;
const ACCEPTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * Drive imports keep the Drive file id at the start of the stored source filename
 * (`google-drive-<id>--<name>`, or `google-drive-<id>.<ext>` without a name), so a
 * re-import of the same link can reuse the image instead of storing a duplicate.
 */
export function googleDriveSourcePrefixes(fileId: string): string[] {
  return [`google-drive-${fileId}--`, `google-drive-${fileId}.`];
}

export function googleDriveFileId(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException('Enter a valid Google Drive file link');
  }

  if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com') {
    throw new BadRequestException('Only HTTPS links from drive.google.com are accepted');
  }

  const pathMatch = url.pathname.match(/^\/file\/d\/([^/]+)/);
  const fileId = pathMatch?.[1] ?? url.searchParams.get('id');
  if (!fileId || !FILE_ID_PATTERN.test(fileId)) {
    throw new BadRequestException('The Google Drive link does not contain a valid file ID');
  }
  return fileId;
}

@Injectable()
export class GoogleDriveImageService {
  async download(driveUrl: string): Promise<Express.Multer.File> {
    const fileId = googleDriveFileId(driveUrl);
    const downloadUrl = new URL('https://drive.usercontent.google.com/download');
    downloadUrl.searchParams.set('id', fileId);
    downloadUrl.searchParams.set('export', 'download');
    downloadUrl.searchParams.set('confirm', 't');

    let response: Response;
    try {
      response = await fetch(downloadUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
    } catch {
      throw new BadGatewayException('Google Drive did not respond in time');
    }

    if (!response.ok) {
      throw new BadRequestException(
        'Google Drive could not download this file. Set sharing to “Anyone with the link”.',
      );
    }

    const mimetype = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
    if (!mimetype || !ACCEPTED_MIME_TYPES.has(mimetype)) {
      throw new BadRequestException(
        'The Drive link must point directly to a JPEG, PNG, WebP, or GIF image',
      );
    }

    const declaredBytes = Number(response.headers.get('content-length') ?? 0);
    if (declaredBytes > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Google Drive image must be 8 MB or smaller');
    }

    const buffer = await this.readBoundedBody(response);
    const originalname = this.sourceFilename(
      response.headers.get('content-disposition'),
      fileId,
      mimetype,
    );

    return {
      fieldname: 'file',
      originalname,
      encoding: '7bit',
      mimetype,
      size: buffer.length,
      buffer,
      destination: '',
      filename: '',
      path: '',
      stream: Readable.from(buffer),
    };
  }

  private async readBoundedBody(response: Response): Promise<Buffer> {
    if (!response.body) {
      throw new BadRequestException('Google Drive returned an empty image');
    }
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw new BadRequestException('Google Drive image must be 8 MB or smaller');
      }
      chunks.push(Buffer.from(value));
    }

    if (totalBytes === 0) {
      throw new BadRequestException('Google Drive returned an empty image');
    }
    return Buffer.concat(chunks, totalBytes);
  }

  private sourceFilename(
    contentDisposition: string | null,
    fileId: string,
    mimetype: string,
  ): string {
    const encodedName = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const quotedName = contentDisposition?.match(/filename="([^"]+)"/i)?.[1];
    let suppliedName = quotedName;
    if (encodedName) {
      try {
        suppliedName = decodeURIComponent(encodedName);
      } catch {
        suppliedName = undefined;
      }
    }
    const safeName = suppliedName ? basename(suppliedName) : '';
    return safeName
      ? `google-drive-${fileId}--${safeName}`.slice(0, 255)
      : `google-drive-${fileId}.${EXTENSIONS[mimetype]}`;
  }
}
