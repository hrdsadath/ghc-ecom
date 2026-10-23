import { ArgumentsHost, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { apiServerErrors } from '../../operations/metrics';
import { AllExceptionsFilter } from './all-exceptions.filter';

interface FilterResult {
  status: number;
  body: Record<string, unknown>;
}

const run = (exception: unknown): FilterResult => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const request = {
    method: 'POST',
    originalUrl: '/api/v1/admin/promotions/coupons',
    header: (): string => 'request-1',
  };
  const host = {
    switchToHttp: (): object => ({
      getRequest: (): object => request,
      getResponse: (): object => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return {
    status: status.mock.calls[0][0] as number,
    body: json.mock.calls[0][0] as Record<string, unknown>,
  };
};

const known = (
  code: string,
  meta?: Record<string, unknown>,
): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('database error', {
    code,
    clientVersion: 'test',
    meta,
  });

describe('AllExceptionsFilter', () => {
  let serverErrors: jest.SpyInstance;

  beforeEach(() => {
    serverErrors = jest.spyOn(apiServerErrors, 'inc').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('maps duplicate coupon and warehouse codes to specific 409 messages', () => {
    expect(run(known('P2002', { modelName: 'Coupon', target: ['code'] }))).toMatchObject({
      status: 409,
      body: { statusCode: 409, error: 'Conflict', message: 'That coupon code already exists' },
    });
    expect(run(known('P2002', { modelName: 'Warehouse', target: ['code'] })).body.message).toBe(
      'That warehouse code already exists',
    );
    expect(serverErrors).not.toHaveBeenCalled();
  });

  it('names other unique fields from meta.target and falls back to a generic message', () => {
    expect(run(known('P2002', { modelName: 'Order', target: ['orderNumber'] })).body.message).toBe(
      'That order number already exists',
    );
    expect(run(known('P2002', { target: 'coupons_code_key' })).body.message).toBe(
      'That value already exists',
    );
    expect(run(known('P2002')).body.message).toBe('That value already exists');
  });

  it('maps missing records to 404', () => {
    expect(run(known('P2025', { modelName: 'Coupon' }))).toMatchObject({
      status: 404,
      body: { error: 'Not Found', message: 'Coupon not found' },
    });
    expect(run(known('P2025')).body.message).toBe('Record not found');
    expect(serverErrors).not.toHaveBeenCalled();
  });

  it('maps Postgres check and unique violations from raw queries and ORM writes to 409', () => {
    expect(
      run(known('P2010', { code: '23514', message: 'violates check constraint' })).status,
    ).toBe(409);
    expect(run(known('P2010', { code: '23505' })).body.message).toBe('That value already exists');
    const ormCheck = new Prisma.PrismaClientUnknownRequestError(
      'PostgresError { code: "23514", message: "new row for relation \\"warehouses\\" violates check constraint" }',
      { clientVersion: 'test' },
    );
    expect(run(ormCheck)).toMatchObject({ status: 409, body: { error: 'Conflict' } });
    expect(serverErrors).not.toHaveBeenCalled();
  });

  it('keeps HttpException payloads, including row-level errors', () => {
    expect(run(new NotFoundException('Order not found'))).toMatchObject({
      status: 404,
      body: { error: 'Not Found', message: 'Order not found', requestId: 'request-1' },
    });
    const rows = [
      { index: 0, message: 'Stock changed to 3 since you loaded it — reload and retry' },
    ];
    expect(
      run(new ConflictException({ error: 'Conflict', message: 'Import rejected', errors: rows }))
        .body,
    ).toMatchObject({ statusCode: 409, message: 'Import rejected', errors: rows });
    expect(run(new ConflictException('Busy')).body).not.toHaveProperty('errors');
  });

  it('still reports unexpected failures as counted 500s without leaking details', () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const result = run(new Error('connection reset'));
    expect(result).toMatchObject({
      status: 500,
      body: { error: 'Internal Server Error', message: 'An unexpected error occurred' },
    });
    expect(run(known('P1001')).status).toBe(500);
    expect(serverErrors).toHaveBeenCalledTimes(2);
  });
});
