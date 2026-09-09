import { prisma } from '../config/database';
import { ApiError } from '../utils/apiError';

export class UserService {
  static async getAllUsers() {
    return await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        imageUrl: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  static async getUserById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        imageUrl: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw ApiError.notFound(`User with id '${id}' not found`);
    }

    return user;
  }

  static async createUser(data: { email: string; name?: string; imageUrl?: string }) {
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existing) {
      throw ApiError.badRequest(`Email '${data.email}' is already registered`);
    }

    return await prisma.user.create({
      data,
      select: {
        id: true,
        email: true,
        name: true,
        imageUrl: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  static async deleteUser(id: string) {
    await this.getUserById(id);
    return await prisma.user.delete({
      where: { id },
    });
  }
}
