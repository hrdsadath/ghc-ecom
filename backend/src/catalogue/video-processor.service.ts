import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException, Injectable } from '@nestjs/common';

const ACCEPTED_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/mpeg',
  'video/ogg',
]);
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
// A 25 MB phone clip can take well over 25 s to re-encode on a small instance; the admin
// client waits up to 180 s for the whole upload, conversion and storage round trip.
const TRANSCODE_TIMEOUT_MS = 90_000;
// Product videos play in a page-width player, so anything larger than 1280 px on its
// longer side is scaled down (never up) to keep conversion fast and files small.
const MAX_VIDEO_DIMENSION = 1280;

export function ffmpegArguments(inputPath: string, outputPath: string): string[] {
  return [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-vf',
    `scale=w='min(${MAX_VIDEO_DIMENSION},iw)':h='min(${MAX_VIDEO_DIMENSION},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    outputPath,
  ];
}

export interface ProcessedProductVideo {
  buffer: Buffer;
  mimetype: 'video/mp4';
}

@Injectable()
export class VideoProcessorService {
  async process(file: Express.Multer.File): Promise<ProcessedProductVideo> {
    if (!ACCEPTED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Upload an MP4, WebM, MOV, AVI, MPEG, or OGG video');
    }
    if (!file.buffer.length) {
      throw new BadRequestException('The uploaded video is empty');
    }

    const directory = await mkdtemp(join(tmpdir(), 'ghc-product-video-'));
    const inputPath = join(directory, 'input');
    const outputPath = join(directory, 'video.mp4');

    try {
      await writeFile(inputPath, file.buffer, { flag: 'wx' });
      await this.transcode(inputPath, outputPath);
      const output = await stat(outputPath);
      if (output.size === 0 || output.size > MAX_OUTPUT_BYTES) {
        throw new BadRequestException('The converted video is empty or exceeds the 50 MB limit');
      }
      return { buffer: await readFile(outputPath), mimetype: 'video/mp4' };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Video conversion failed. Use a valid, short product video.');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  private transcode(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const process = spawn('ffmpeg', ffmpegArguments(inputPath, outputPath), {
        stdio: ['ignore', 'ignore', 'ignore'],
      });

      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        process.kill('SIGKILL');
      }, TRANSCODE_TIMEOUT_MS);

      process.once('error', () => {
        clearTimeout(timeout);
        reject(new BadRequestException('Video converter is unavailable'));
      });
      process.once('close', (code) => {
        clearTimeout(timeout);
        if (timedOut) {
          reject(new BadRequestException('Video conversion took too long; upload a shorter video'));
          return;
        }
        if (code !== 0) {
          reject(new BadRequestException('The uploaded file is not a supported video'));
          return;
        }
        resolve();
      });
    });
  }
}
