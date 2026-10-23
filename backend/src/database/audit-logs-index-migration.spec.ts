import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('audit log keyset index migration', () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20261011120000_audit_logs_created_at_index/migration.sql',
    ),
    'utf8',
  );
  const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
  const auditService = readFileSync(join(process.cwd(), 'src/audit/audit.service.ts'), 'utf8');

  it('indexes audit logs in the order the activity log pages through them', () => {
    expect(migration).toMatch(
      /create index if not exists audit_logs_created_at_id_idx\s+on public\.audit_logs \(created_at desc, id desc\);/,
    );
    expect(auditService).toContain('order by log.created_at desc, log.id desc');
  });

  it('stays a plain idempotent statement that prisma migrate deploy can run in a transaction', () => {
    expect(migration.toLowerCase()).not.toContain('concurrently');
  });

  it('matches the AuditLog model', () => {
    expect(schema).toContain(
      '@@index([createdAt(sort: Desc), id(sort: Desc)], map: "audit_logs_created_at_id_idx")',
    );
  });
});
