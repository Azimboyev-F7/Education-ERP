import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Principal } from '../access/principal.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashPassword, verifyPassword } from './password.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function sessionTtlMs(): number {
  return Number(process.env.SESSION_TTL_HOURS ?? 168) * 60 * 60 * 1000;
}

@Injectable()
export class AuthService {
  /** Verified against when the username is unknown, so response time does not reveal which usernames exist. */
  private readonly dummyHash = hashPassword(randomBytes(16).toString('hex'));

  constructor(private readonly prisma: PrismaService) {}

  /** Returns a new session token, or null when the credentials are wrong or the account is disabled. */
  async login(
    username: string,
    password: string,
  ): Promise<{ token: string; userId: string; centerId: string } | null> {
    const user = await this.prisma.user.findUnique({ where: { username } });
    const ok = await verifyPassword(user?.passwordHash ?? (await this.dummyHash), password);
    if (!user || !ok || user.status !== 'ACTIVE') return null;

    const token = randomBytes(32).toString('base64url');
    await this.prisma.session.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + sessionTtlMs()) },
    });
    return { token, userId: user.id, centerId: user.centerId };
  }

  async logout(token: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  }

  async resolve(token: string): Promise<Principal | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: {
        user: {
          include: {
            roleAssignments: true,
            teaching: { select: { groupId: true } },
            studentProfile: { select: { userId: true } },
          },
        },
      },
    });
    if (!session || session.expiresAt <= new Date() || session.user.status !== 'ACTIVE') return null;

    const { user } = session;
    return {
      userId: user.id,
      centerId: user.centerId,
      username: user.username,
      fullName: user.fullName,
      roles: user.roleAssignments.map((r) => ({ role: r.role, branchId: r.branchId })),
      taughtGroupIds: user.teaching.map((t) => t.groupId),
      isStudent: user.studentProfile !== null,
    };
  }
}
