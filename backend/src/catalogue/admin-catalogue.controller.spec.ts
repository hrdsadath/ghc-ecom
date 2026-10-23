import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { AdminCatalogueController } from './admin-catalogue.controller';
import { CatalogueService } from './catalogue.service';
import { GoogleDriveImageService } from './google-drive-image.service';

const productId = '0f8fad5b-d9cb-469f-a165-70867728950e';
const imageIds = ['2b4f4c3e-9a57-4a39-9d5d-6c8f0b7a1e21', '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f'];

describe('AdminCatalogueController routes', () => {
  let app: INestApplication;
  const catalogue = {
    listAdminProductPage: jest.fn(),
    listAdminProducts: jest.fn(),
    getAdminProduct: jest.fn(),
    reorderProductImages: jest.fn(),
    replaceProductImage: jest.fn(),
  };
  const allowAsActor: CanActivate = {
    canActivate: (context: ExecutionContext) => {
      context.switchToHttp().getRequest<{ user: unknown }>().user = { id: 'actor-id' };
      return true;
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminCatalogueController],
      providers: [
        { provide: CatalogueService, useValue: catalogue },
        { provide: GoogleDriveImageService, useValue: {} },
      ],
    })
      .overrideGuard(SupabaseAuthGuard)
      .useValue(allowAsActor)
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    // Same options as configureApplication.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
        stopAtFirstError: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes typed page, size, search and filters to the paged product list', async () => {
    catalogue.listAdminProductPage.mockResolvedValue({ items: [], total: 0, page: 2, limit: 50 });

    await request(app.getHttpServer())
      .get('/admin/catalogue/products')
      .query({ page: '2', limit: '50', q: '  50%_off ', status: 'DRAFT', category: productId })
      .expect(200, { items: [], total: 0, page: 2, limit: 50 });

    expect(catalogue.listAdminProductPage).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        limit: 50,
        q: '50%_off',
        status: 'DRAFT',
        category: productId,
      }),
    );
  });

  it('defaults to the first page of 20 and rejects other page sizes', async () => {
    catalogue.listAdminProductPage.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    await request(app.getHttpServer()).get('/admin/catalogue/products').expect(200);
    expect(catalogue.listAdminProductPage).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 20 }),
    );

    await request(app.getHttpServer()).get('/admin/catalogue/products?limit=1000').expect(400);
    await request(app.getHttpServer()).get('/admin/catalogue/products?status=LIVE').expect(400);
    await request(app.getHttpServer()).get('/admin/catalogue/products?category=tea').expect(400);
  });

  it('serves the whole catalogue from products/all instead of treating "all" as an id', async () => {
    catalogue.listAdminProducts.mockResolvedValue([{ id: productId }]);

    await request(app.getHttpServer())
      .get('/admin/catalogue/products/all')
      .expect(200, [{ id: productId }]);
    expect(catalogue.getAdminProduct).not.toHaveBeenCalled();
  });

  it('reorders images through images/order instead of the image replacement route', async () => {
    catalogue.reorderProductImages.mockResolvedValue([]);

    await request(app.getHttpServer())
      .put(`/admin/catalogue/products/${productId}/images/order`)
      .send({ imageIds })
      .expect(200);

    expect(catalogue.reorderProductImages).toHaveBeenCalledWith(
      'actor-id',
      productId,
      imageIds,
      expect.any(Object),
    );
    expect(catalogue.replaceProductImage).not.toHaveBeenCalled();
  });

  it('rejects a reorder with repeated or malformed image ids', async () => {
    await request(app.getHttpServer())
      .put(`/admin/catalogue/products/${productId}/images/order`)
      .send({ imageIds: [imageIds[0], imageIds[0]] })
      .expect(400);
    await request(app.getHttpServer())
      .put(`/admin/catalogue/products/${productId}/images/order`)
      .send({ imageIds: ['not-a-uuid'] })
      .expect(400);
    expect(catalogue.reorderProductImages).not.toHaveBeenCalled();
  });
});
