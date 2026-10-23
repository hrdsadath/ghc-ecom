import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { apiServerErrors } from '../../operations/metrics';

interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
  /** Row- or field-level details some endpoints attach (for example bulk imports). */
  errors?: unknown;
  path: string;
  requestId: string | null;
  timestamp: string;
}

type ErrorDetails = Pick<ErrorResponse, 'error' | 'message' | 'errors'>;

interface MappedError extends ErrorDetails {
  status: number;
}

const POSTGRES_UNIQUE_VIOLATION = '23505';
const POSTGRES_CHECK_VIOLATION = '23514';

const CHECK_VIOLATION_MESSAGE =
  'That change breaks a data rule and was not saved. Reload and retry.';

/** Friendlier wording for unique fields people actually type into the admin. */
const UNIQUE_FIELD_MESSAGES: Record<string, string> = {
  'Coupon.code': 'That coupon code already exists',
  'Warehouse.code': 'That warehouse code already exists',
  'ProductVariant.sku': 'That SKU already exists',
  'Product.slug': 'That product URL slug already exists',
  'Category.slug': 'That category URL slug already exists',
};

const humanizeField = (field: string): string =>
  field
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim();

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const database = this.mapDatabaseError(exception);
    const status = database
      ? database.status
      : exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const details: ErrorDetails = database
      ? { error: database.error, message: database.message }
      : this.getExceptionDetails(exception);
    const requestId = request.header('x-request-id') ?? null;
    const body: ErrorResponse = {
      statusCode: status,
      ...details,
      path: request.originalUrl,
      requestId,
      timestamp: new Date().toISOString(),
    };

    // Expected client conflicts (duplicates, missing records, rule violations) are not server
    // errors, so they stay out of the API server-error metric and alerting.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      apiServerErrors.inc({
        method: request.method,
        status_code: String(status),
      });
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(`${request.method} ${request.originalUrl} failed`, stack);
    }

    response.status(status).json(body);
  }

  /** Maps well-understood database failures to client errors instead of a generic 500. */
  private mapDatabaseError(exception: unknown): MappedError | null {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const meta = (exception.meta ?? {}) as {
        target?: unknown;
        modelName?: unknown;
        code?: unknown;
      };
      if (exception.code === 'P2002') {
        return this.conflict(this.uniqueMessage(meta.modelName, meta.target));
      }
      if (exception.code === 'P2025') {
        const model = typeof meta.modelName === 'string' ? meta.modelName : '';
        return {
          status: HttpStatus.NOT_FOUND,
          error: 'Not Found',
          message: model
            ? `${humanizeField(model).replace(/^\w/, (c) => c.toUpperCase())} not found`
            : 'Record not found',
        };
      }
      if (exception.code === 'P2004') return this.conflict(CHECK_VIOLATION_MESSAGE);
      if (exception.code === 'P2010') {
        if (meta.code === POSTGRES_UNIQUE_VIOLATION) {
          return this.conflict('That value already exists');
        }
        if (meta.code === POSTGRES_CHECK_VIOLATION) return this.conflict(CHECK_VIOLATION_MESSAGE);
      }
      return null;
    }
    // Prisma surfaces check-constraint violations from ORM writes as an "unknown" error whose
    // message carries the Postgres SQLSTATE.
    if (
      exception instanceof Prisma.PrismaClientUnknownRequestError &&
      (exception.message.includes(`"${POSTGRES_CHECK_VIOLATION}"`) ||
        exception.message.includes('violates check constraint'))
    ) {
      return this.conflict(CHECK_VIOLATION_MESSAGE);
    }
    return null;
  }

  private uniqueMessage(modelName: unknown, target: unknown): string {
    const fields = Array.isArray(target)
      ? target.map(String)
      : typeof target === 'string'
        ? [target]
        : [];
    if (typeof modelName === 'string' && fields.length === 1) {
      const specific = UNIQUE_FIELD_MESSAGES[`${modelName}.${fields[0]}`];
      if (specific) return specific;
    }
    // A constraint name (e.g. "coupons_code_key") is not a readable field list.
    if (!fields.length || fields.some((field) => field.endsWith('_key'))) {
      return 'That value already exists';
    }
    return `That ${fields.map(humanizeField).join(' and ')} already exists`;
  }

  private conflict(message: string): MappedError {
    return { status: HttpStatus.CONFLICT, error: 'Conflict', message };
  }

  private getExceptionDetails(exception: unknown): ErrorDetails {
    if (!(exception instanceof HttpException)) {
      return {
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
      };
    }

    const response = exception.getResponse();
    if (typeof response === 'string') {
      return {
        error: this.humanizeExceptionName(exception.name),
        message: response,
      };
    }

    const payload = response as {
      error?: string;
      message?: string | string[];
      errors?: unknown;
    };
    return {
      error: payload.error ?? this.humanizeExceptionName(exception.name),
      message: payload.message ?? exception.message,
      ...(payload.errors !== undefined ? { errors: payload.errors } : {}),
    };
  }

  private humanizeExceptionName(name: string): string {
    return name
      .replace(/Exception$/, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .trim();
  }
}
