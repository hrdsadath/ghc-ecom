import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/application';
import { PrismaService } from '../src/database/prisma.service';
import { PaymentQueueService } from '../src/payments/payment-queue.service';
import { RedisService } from '../src/redis/redis.service';
import { SupabaseService } from '../src/supabase/supabase.service';

describe('Application health (e2e)', () => {
  let app: NestExpressApplication;
  const prisma = {
    $queryRaw: jest.fn(),
    category: {
      findMany: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
    },
    userRole: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    webhookEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };
  const redis = {
    ping: jest.fn(),
  };
  const supabase = {
    verifyAccessToken: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    resetPassword: jest.fn(),
  };
  const paymentQueue = {
    enqueueWebhook: jest.fn(),
  };

  beforeEach(async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    redis.ping.mockResolvedValue('PONG');
    prisma.userRole.findFirst.mockResolvedValue(null);
    prisma.userRole.findMany.mockResolvedValue([{ role: 'CUSTOMER' }]);
    prisma.category.findMany.mockResolvedValue([
      {
        id: '0f8fad5b-d9cb-469f-a165-70867728950e',
        name: 'Published',
        slug: 'published',
        isPublished: true,
      },
    ]);
    supabase.verifyAccessToken.mockResolvedValue({
      id: 'customer-id',
      email: 'customer@example.com',
    });
    supabase.login.mockResolvedValue({
      data: {
        user: {
          id: 'customer-id',
          email: 'customer@example.com',
          user_metadata: { full_name: 'Customer' },
        },
        session: {
          access_token: 'server-only-access-token',
          refresh_token: 'server-only-refresh-token',
          expires_at: Math.floor(Date.now() / 1_000) + 3_600,
          user: {
            id: 'customer-id',
            email: 'customer@example.com',
            user_metadata: { full_name: 'Customer' },
          },
        },
      },
      error: null,
    });
    supabase.refresh.mockResolvedValue({
      data: {
        user: {
          id: 'customer-id',
          email: 'customer@example.com',
          user_metadata: { full_name: 'Customer' },
        },
        session: {
          access_token: 'refreshed-server-only-access-token',
          refresh_token: 'refreshed-server-only-refresh-token',
          expires_at: Math.floor(Date.now() / 1_000) + 3_600,
          user: {
            id: 'customer-id',
            email: 'customer@example.com',
            user_metadata: { full_name: 'Customer' },
          },
        },
      },
      error: null,
    });
    supabase.logout.mockResolvedValue(undefined);
    supabase.resetPassword.mockResolvedValue(undefined);
    prisma.webhookEvent.findUnique.mockResolvedValue(null);
    prisma.webhookEvent.create.mockResolvedValue({
      id: 'webhook-local-1',
      providerEventId: 'webhook-provider-1',
    });
    paymentQueue.enqueueWebhook.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(RedisService)
      .useValue(redis)
      .overrideProvider(SupabaseService)
      .useValue(supabase)
      .overrideProvider(PaymentQueueService)
      .useValue(paymentQueue)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({
      rawBody: true,
      bodyParser: false,
    });
    configureApplication(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  it('returns 200 from the liveness endpoint', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect('x-content-type-options', 'nosniff')
      .expect('x-frame-options', 'SAMEORIGIN')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('returns 503 from readiness when Postgres is unavailable', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await request(app.getHttpServer()).get('/api/v1/ready').expect(503);

    expect(response.body).toMatchObject({
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'Dependencies are unavailable',
      path: '/api/v1/ready',
    });
    expect(response.body).not.toHaveProperty('stack');
  });

  it('returns 503 from readiness when Redis is unavailable', async () => {
    redis.ping.mockRejectedValueOnce(new Error('redis unavailable'));

    const response = await request(app.getHttpServer()).get('/api/v1/ready').expect(503);

    expect(response.body).toMatchObject({
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'Dependencies are unavailable',
      path: '/api/v1/ready',
    });
    expect(response.body).not.toHaveProperty('stack');
  });

  it('returns the standard error response without a stack trace', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);

    expect(response.body).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
      path: '/api/v1/does-not-exist',
    });
    expect(response.body.requestId).toEqual(expect.any(String));
    expect(response.body).not.toHaveProperty('stack');
  });

  it('serves the generated OpenAPI document', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/docs-json').expect(200);

    expect(response.body).toMatchObject({
      openapi: expect.any(String),
      info: {
        title: 'GHC Ecommerce API',
        version: '1.0',
      },
    });
  });

  it('rejects an unauthenticated customer endpoint request', async () => {
    await request(app.getHttpServer()).get('/api/v1/me/profile').expect(401);
  });

  it('reports an anonymous browser session without expected 401 responses', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/auth/session').expect(200);

    expect(response.body).toEqual({ authenticated: false, user: null, roles: [] });
    expect(supabase.verifyAccessToken).not.toHaveBeenCalled();
    expect(supabase.refresh).not.toHaveBeenCalled();
  });

  it('restores an expired browser session from its refresh cookie', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('cookie', 'ghc_refresh=server-only-refresh-token')
      .expect(200);

    expect(response.body).toMatchObject({
      authenticated: true,
      user: { id: 'customer-id', email: 'customer@example.com' },
      roles: ['CUSTOMER'],
      csrfToken: expect.any(String),
    });
    expect(supabase.refresh).toHaveBeenCalledWith('server-only-refresh-token');
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^ghc_access=.*HttpOnly.*SameSite=Lax/),
        expect.stringMatching(/^ghc_refresh=.*HttpOnly.*SameSite=Lax/),
      ]),
    );
  });

  it('keeps session credentials in HttpOnly cookies and enforces CSRF', async () => {
    const browser = request.agent(app.getHttpServer());
    const login = await browser
      .post('/api/v1/auth/login')
      .send({ email: 'customer@example.com', password: 'correct-password' })
      .expect(200);

    expect(login.body).toMatchObject({
      authenticated: true,
      user: { id: 'customer-id', email: 'customer@example.com' },
      roles: ['CUSTOMER'],
      csrfToken: expect.any(String),
    });
    expect(JSON.stringify(login.body)).not.toContain('server-only-access-token');
    expect(JSON.stringify(login.body)).not.toContain('server-only-refresh-token');
    expect(login.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^ghc_access=.*HttpOnly.*SameSite=Lax/),
        expect.stringMatching(/^ghc_refresh=.*HttpOnly.*SameSite=Lax/),
        expect.stringMatching(/^ghc_csrf=.*HttpOnly.*SameSite=Lax/),
      ]),
    );

    await browser
      .get('/api/v1/auth/session')
      .expect(200)
      .expect({
        authenticated: true,
        user: {
          id: 'customer-id',
          email: 'customer@example.com',
        },
        roles: ['CUSTOMER'],
      });

    await browser.post('/api/v1/auth/logout').expect(403);
    await browser.post('/api/v1/auth/logout').set('x-csrf-token', login.body.csrfToken).expect(204);
    expect(supabase.logout).toHaveBeenCalledWith('server-only-access-token');
  });

  it('updates a recovered password through the backend instead of simulating success', async () => {
    const recoveryAccessToken = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjdXN0b21lci1pZCJ9.valid-signature';

    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({
        recoveryAccessToken,
        recoveryRefreshToken: 'one-time-recovery-refresh-token',
        password: 'correct-horse-battery-staple',
      })
      .expect(204);

    expect(supabase.resetPassword).toHaveBeenCalledWith(
      recoveryAccessToken,
      'one-time-recovery-refresh-token',
      'correct-horse-battery-staple',
    );
  });

  it('rejects a non-admin from an admin endpoint', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/audit-logs')
      .set('authorization', 'Bearer customer-token')
      .expect(403);
  });

  it('serves published categories without authentication', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/categories').expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({ slug: 'published', isPublished: true }),
    ]);
    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: { isPublished: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  });

  it('rejects a customer from catalogue administration', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/catalogue/products')
      .set('authorization', 'Bearer customer-token')
      .expect(403);
  });

  it('rejects a non-image product upload before storage', async () => {
    prisma.userRole.findMany.mockResolvedValueOnce([{ role: 'CATALOGUE_MANAGER' }]);

    await request(app.getHttpServer())
      .post('/api/v1/admin/catalogue/products/0f8fad5b-d9cb-469f-a165-70867728950e/images')
      .set('authorization', 'Bearer catalogue-manager-token')
      .field('altText', 'Invalid product image')
      .attach('file', Buffer.from('plain text'), {
        filename: 'invalid.txt',
        contentType: 'text/plain',
      })
      .expect(400);
  });

  it('rejects an oversized product upload before processing', async () => {
    prisma.userRole.findMany.mockResolvedValueOnce([{ role: 'CATALOGUE_MANAGER' }]);

    await request(app.getHttpServer())
      .post('/api/v1/admin/catalogue/products/0f8fad5b-d9cb-469f-a165-70867728950e/images')
      .set('authorization', 'Bearer catalogue-manager-token')
      .field('altText', 'Oversized product image')
      .attach('file', Buffer.alloc(8 * 1024 * 1024 + 1), {
        filename: 'oversized.png',
        contentType: 'image/png',
      })
      .expect(413);
  });

  it('rejects malformed image bytes with a spoofed image MIME type', async () => {
    prisma.userRole.findMany.mockResolvedValueOnce([{ role: 'CATALOGUE_MANAGER' }]);
    prisma.product.findUnique.mockResolvedValueOnce({
      id: '0f8fad5b-d9cb-469f-a165-70867728950e',
    });

    await request(app.getHttpServer())
      .post('/api/v1/admin/catalogue/products/0f8fad5b-d9cb-469f-a165-70867728950e/images')
      .set('authorization', 'Bearer catalogue-manager-token')
      .field('altText', 'Malformed product image')
      .attach('file', Buffer.from('not actually a PNG'), {
        filename: 'malformed.png',
        contentType: 'image/png',
      })
      .expect(400);
  });

  it('rejects client-supplied cart prices and user IDs', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/carts/0f8fad5b-d9cb-469f-a165-70867728950e/items')
      .set('x-cart-token', 'guest-token')
      .send({
        variantId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        quantity: 1,
        pricePaise: 1,
        userId: '1b4e28ba-2fa1-11d2-883f-0016d3cca427',
      })
      .expect(400);
  });

  it('stores and enqueues an authenticated HDFC webhook', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/hdfc')
      .set('content-type', 'application/json')
      .set(
        'authorization',
        `Basic ${Buffer.from('glockeryhooks:e2e-webhook-password').toString('base64')}`,
      )
      .send(
        '{"id":"evt_e2e_1","event_name":"ORDER_SUCCEEDED","content":{"order":{"order_id":"GHC1"}}}',
      )
      .expect(200)
      .expect({ received: true });

    expect(prisma.webhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerEventId: 'evt_e2e_1',
        eventType: 'ORDER_SUCCEEDED',
      }),
    });
    expect(paymentQueue.enqueueWebhook).toHaveBeenCalledWith('webhook-local-1');
  });

  it('rejects HDFC webhooks without the dashboard Basic credentials', async () => {
    // Exempt from CSRF (cross-site provider call) but never unauthenticated.
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/hdfc')
      .set('authorization', `Basic ${Buffer.from('attacker:guess').toString('base64')}`)
      .send({ event_name: 'ORDER_SUCCEEDED', content: { order: { order_id: 'GHC1' } } })
      .expect(401);

    expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
    expect(paymentQueue.enqueueWebhook).not.toHaveBeenCalled();
  });

  it('refuses to start an HDFC checkout while the gateway is disabled', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/checkout/hdfc/intent')
      .send({ quoteId: '0f8fad5b-d9cb-469f-a165-70867728950e' })
      .expect(503);
  });
});
