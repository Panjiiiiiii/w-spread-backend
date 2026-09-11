import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '../config/database';
import { ENV } from '../config/env';
import { ApiError } from '../utils/apiError';

const googleClient = new OAuth2Client(ENV.GOOGLE_CLIENT_ID);
const publicUser = {
  id: true, email: true, name: true, imageUrl: true, role: true, createdAt: true, updatedAt: true,
} as const;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const createSession = async (userId: string) => {
  const sessionToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ENV.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { userId, sessionTokenHash: hashToken(sessionToken), expiresAt } });
  return { sessionToken, expiresAt };
};

export class AuthService {
  static async register(data: { email: string; password: string; name?: string }) {
    const email = data.email.trim().toLowerCase();
    if (await prisma.user.findUnique({ where: { email } })) throw ApiError.badRequest('Email is already registered');
    const user = await prisma.user.create({
      data: { email, name: data.name?.trim() || undefined, passwordHash: await bcrypt.hash(data.password, 12) },
      select: publicUser,
    });
    return { user, ...(await createSession(user.id)) };
  }

  static async updateImage(userId: string, imageUrl: string) {
    return prisma.user.update({ where: { id: userId }, data: { imageUrl }, select: publicUser });
  }

  static async getUser(userId: string) {
    return prisma.user.findUniqueOrThrow({ where: { id: userId }, select: publicUser });
  }

  static async login(emailInput: string, password: string) {
    const email = emailInput.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      throw ApiError.unauthorized('Invalid email or password');
    }
    return {
      user: await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: publicUser }),
      ...(await createSession(user.id)),
    };
  }

  static async loginWithGoogle(idToken: string) {
    if (!ENV.GOOGLE_CLIENT_ID) throw ApiError.internal('Google login is not configured');
    let ticket;
    try {
      ticket = await googleClient.verifyIdToken({ idToken, audience: ENV.GOOGLE_CLIENT_ID });
    } catch {
      throw ApiError.unauthorized('Invalid Google ID token');
    }
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw ApiError.unauthorized('Invalid Google account');
    }

    const user = await prisma.$transaction(async (tx) => {
      const account = await tx.authAccount.findUnique({
        where: { provider_providerAccountId: { provider: 'GOOGLE', providerAccountId: payload.sub! } },
        include: { user: true },
      });
      if (account) return account.user;
      const email = payload.email!.toLowerCase();
      const existing = await tx.user.findUnique({ where: { email } });
      const savedUser = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: { name: existing.name || payload.name, imageUrl: existing.imageUrl || payload.picture, emailVerifiedAt: existing.emailVerifiedAt || new Date() },
          })
        : await tx.user.create({ data: { email, name: payload.name, imageUrl: payload.picture, emailVerifiedAt: new Date() } });
      await tx.authAccount.create({ data: { userId: savedUser.id, provider: 'GOOGLE', providerAccountId: payload.sub! } });
      return savedUser;
    });

    return {
      user: await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: publicUser }),
      ...(await createSession(user.id)),
    };
  }
}
