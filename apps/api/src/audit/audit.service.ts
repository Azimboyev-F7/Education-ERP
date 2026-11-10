import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AuditEntry {
  action: string;
  centerId?: string | null;
  actorId?: string | null;
  entityType?: string;
  entityId?: string;
  data?: Record<string, string | number | boolean | null>;
}

/** Append-only record of who did what. Called explicitly from every staff write path. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: entry.action,
        centerId: entry.centerId ?? null,
        actorId: entry.actorId ?? null,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        data: entry.data,
      },
    });
  }
}
