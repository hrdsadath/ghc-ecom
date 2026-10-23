import { BadRequestException } from '@nestjs/common';
import { VideoProcessorService, ffmpegArguments } from './video-processor.service';

function file(buffer: Buffer, mimetype: string): Express.Multer.File {
  return {
    buffer,
    mimetype,
    originalname: 'product.mov',
    fieldname: 'file',
    encoding: '7bit',
    size: buffer.length,
    destination: '',
    filename: '',
    path: '',
    stream: undefined as never,
  };
}

describe('VideoProcessorService', () => {
  it('rejects unsupported video MIME types before invoking FFmpeg', async () => {
    await expect(
      new VideoProcessorService().process(file(Buffer.from('nope'), 'application/pdf')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('scales large videos down to 1280 px on the longer side without upscaling', () => {
    const args = ffmpegArguments('in', 'out.mp4');
    const filter = args[args.indexOf('-vf') + 1];
    expect(filter).toBe(
      "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
    );
    expect(args.at(-1)).toBe('out.mp4');
  });

  it('rejects empty video uploads', async () => {
    await expect(
      new VideoProcessorService().process(file(Buffer.alloc(0), 'video/mp4')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
