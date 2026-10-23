import { ValidationPipe } from '@nestjs/common';
import { CreateProductDto } from './create-product.dto';
import { CreateVariantDto } from './create-variant.dto';
import { UpdateVariantDto } from './update-variant.dto';

const validationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  forbidUnknownValues: true,
  stopAtFirstError: true,
  transform: true,
});

describe('catalogue import compatibility', () => {
  it('limits a legacy long shortDescription while preserving the full description', async () => {
    const description = 'Long catalogue description. '.repeat(20);
    const result = await validationPipe.transform(
      {
        categoryId: '3d659f24-eebd-4245-a36d-c0e0d64b028f',
        name: 'Legacy catalogue product',
        slug: 'legacy-catalogue-product',
        shortDescription: description,
        description,
      },
      { type: 'body', metatype: CreateProductDto },
    );

    expect(result.shortDescription.length).toBeLessThanOrEqual(300);
    expect(result.description).toBe(description);
  });

  it('accepts the legacy barcode field during the alias transition', async () => {
    const result = await validationPipe.transform(
      {
        sku: '16187-29-GREY',
        barcode: '16187-29-GREY',
        pricePaise: 690000,
      },
      { type: 'body', metatype: CreateVariantDto },
    );

    expect(result.barcode).toBe('16187-29-GREY');
  });

  it('accepts alias as optional descriptive text', async () => {
    const result = await validationPipe.transform(
      {
        sku: 'DISPLAY-SET-1',
        alias: 'Display set — staff favourite 😊',
        pricePaise: 690000,
      },
      { type: 'body', metatype: CreateVariantDto },
    );

    expect(result.alias).toBe('Display set — staff favourite 😊');
  });

  it('accepts null to clear a variant colour and swatch', async () => {
    const result = await validationPipe.transform(
      { color: null, colorHex: null },
      { type: 'body', metatype: UpdateVariantDto },
    );

    expect(result).toMatchObject({ color: null, colorHex: null });
  });
});
