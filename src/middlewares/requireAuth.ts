import { NextFunction, Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { prisma } from '../config/database';
import { ApiError } from '../utils/apiError';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const authorization = req.header('Authorization');
    if (!authorization) throw ApiError.unauthorized('Authorization is required');

    const token = authorization.replace(/^Bearer\s+/i, '').trim();
    if (!token) throw ApiError.unauthorized('Authorization token is required');

    const session = await prisma.session.findUnique({
      where: { sessionTokenHash: hashToken(token) },
      select: { userId: true, expiresAt: true, revokedAt: true },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw ApiError.unauthorized('Invalid or expired session');
    }

    req.userId = session.userId;
    next();
  } catch (error) {
    next(error);
  }
}
