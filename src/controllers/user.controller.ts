import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service';
import { sendResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';

export class UserController {
  static async getAll(_req: Request, res: Response, next: NextFunction) {
    try {
      const users = await UserService.getAllUsers();
      return sendResponse(res, {
        message: 'Users retrieved successfully',
        data: users,
        meta: { total: users.length },
      });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const user = await UserService.getUserById(id);
      return sendResponse(res, {
        message: 'User retrieved successfully',
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, name } = req.body;

      if (!email || typeof email !== 'string') {
        throw ApiError.badRequest('Field email is required and must be a string');
      }

      const newUser = await UserService.createUser({ email, name });
      return sendResponse(res, {
        statusCode: 201,
        message: 'User created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await UserService.deleteUser(id);
      return sendResponse(res, {
        message: 'User deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}
