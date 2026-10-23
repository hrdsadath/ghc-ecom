import { BadRequestException } from '@nestjs/common';
import { GoogleDriveImageService, googleDriveFileId } from './google-drive-image.service';

const fileId = '1AbCdEfGhIjKlMnOpQrStUvWxYz';

describe('Google Drive image import', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('extracts file IDs from supported Google Drive share links', () => {
    expect(googleDriveFileId(`https://drive.google.com/file/d/${fileId}/view?usp=sharing`)).toBe(
      fileId,
    );
    expect(googleDriveFileId(`https://drive.google.com/open?id=${fileId}`)).toBe(fileId);
  });

  it('rejects links outside Google Drive', () => {
    expect(() => googleDriveFileId(`https://example.com/file/d/${fileId}`)).toThrow(
      BadRequestException,
    );
  });

  it('downloads a public Drive image as an upload-compatible file', async () => {
    const bytes = Buffer.from('image-bytes');
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(bytes, {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'content-length': String(bytes.length),
          'content-disposition': 'attachment; filename="catalogue.png"',
        },
      }),
    );

    const result = await new GoogleDriveImageService().download(
      `https://drive.google.com/file/d/${fileId}/view`,
    );

    expect(result).toMatchObject({
      originalname: `google-drive-${fileId}--catalogue.png`,
      mimetype: 'image/png',
      size: bytes.length,
      buffer: bytes,
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: 'drive.usercontent.google.com',
      }),
      expect.objectContaining({ redirect: 'follow' }),
    );
  });

  it('rejects Drive responses that are not supported images', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('<html>sharing page</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );

    await expect(
      new GoogleDriveImageService().download(`https://drive.google.com/file/d/${fileId}/view`),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
