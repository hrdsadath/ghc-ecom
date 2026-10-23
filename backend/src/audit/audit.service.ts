import { Injectable } from '@nestjs/common';
import { AuditLog, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export interface AuditEvent {
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogQuery {
  limit?: number;
  /** Id of the last record of the previous page. */
  cursor?: string;
  actorId?: string;
  entityType?: string;
  /** Case-insensitive substring of the action, such as "role" or "catalogue.product". */
  action?: string;
  from?: Date;
  to?: Date;
}

export interface AuditLogPage {
  items: AuditLog[];
  nextCursor: string | null;
}

export const AUDIT_PAGE_SIZE = 50;
export const AUDIT_MAX_PAGE_SIZE = 100;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(event: AuditEvent): Promise<AuditLog> {
    return this.prisma.auditLog.create({
      data: {
        actorId: event.actorId,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        metadata: event.metadata ?? {},
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
      },
    });
  }

  /**
   * Newest first, keyset-paginated on (created_at, id). The cursor row is compared inside SQL so
   * the database's microsecond timestamps are not truncated to JavaScript milliseconds.
   */
  async list(query: AuditLogQuery = {}): Promise<AuditLogPage> {
    const limit = Math.min(
      Math.max(Math.trunc(query.limit ?? AUDIT_PAGE_SIZE), 1),
      AUDIT_MAX_PAGE_SIZE,
    );
    const conditions: Prisma.Sql[] = [Prisma.sql`true`];
    if (query.actorId) conditions.push(Prisma.sql`log.actor_id = ${query.actorId}::uuid`);
    if (query.entityType) conditions.push(Prisma.sql`log.entity_type = ${query.entityType}`);
    if (query.action) {
      const pattern = `%${query.action.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
      conditions.push(Prisma.sql`log.action ilike ${pattern}`);
    }
    if (query.from) conditions.push(Prisma.sql`log.created_at >= ${query.from}`);
    if (query.to) conditions.push(Prisma.sql`log.created_at <= ${query.to}`);
    if (query.cursor) {
      conditions.push(Prisma.sql`(log.created_at, log.id) < (
        select cursor_row.created_at, cursor_row.id
        from public.audit_logs as cursor_row
        where cursor_row.id = ${query.cursor}::uuid
      )`);
    }
    const rows = await this.prisma.$queryRaw<AuditLog[]>`
      select
        log.id,
        log.actor_id as "actorId",
        log.action,
        log.entity_type as "entityType",
        log.entity_id as "entityId",
        log.metadata,
        log.ip_address as "ipAddress",
        log.user_agent as "userAgent",
        log.created_at as "createdAt"
      from public.audit_logs as log
      where ${Prisma.join(conditions, ' and ')}
      order by log.created_at desc, log.id desc
      limit ${limit + 1}
    `;
    const items = rows.slice(0, limit);
    return {
      items,
      nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null,
    };
  }
}
