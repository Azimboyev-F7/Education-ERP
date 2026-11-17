import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { Principal } from '../access/principal.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashPassword, passwordProblem, verifyPassword } from './password.js';

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

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
    // Usernames are stored lowercase.
    const user = await this.prisma.user.findUnique({ where: { username: username.toLowerCase() } });
    const ok = await verifyPassword(user?.passwordHash ?? (await this.dummyHash), password);
    if (!user || !ok || user.status !== 'ACTIVE') return null;

    const token = randomBytes(32).toString('base64url');
    await this.prisma.session.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + sessionTtlMs()) },
    });
    // Expired sessions are never reused, so clear this user's old ones as they sign in again.
    await this.prisma.session.deleteMany({ where: { userId: user.id, expiresAt: { lte: new Date() } } });
    return { token, userId: user.id, centerId: user.centerId };
  }

  async logout(token: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  }

  /**
   * Sets a new password for the signed-in user and signs out every other session.
   * Returns false when the current password is wrong.
   */
  async changePassword(user: Principal, token: string, current: string, next: string): Promise<boolean> {
    const row = await this.prisma.user.findUniqueOrThrow({ where: { id: user.userId } });
    if (!(await verifyPassword(row.passwordHash, current))) return false;

    if (current === next) throw new BadRequestException('Choose a password you have not used just now');
    const problem = passwordProblem(next, row.username);
    if (problem) throw new BadRequestException(problem);

    const passwordHash = await hashPassword(next);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: row.id }, data: { passwordHash, mustChangePassword: false } }),
      this.prisma.session.deleteMany({ where: { userId: row.id, tokenHash: { not: sha256(token) } } }),
    ]);
    return true;
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
      mustChangePassword: user.mustChangePassword,
    };
  }
}
