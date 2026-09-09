import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { AuthService } from '../services/auth.service';
import { StorageService } from '../services/storage.service';
import { ApiError } from '../utils/apiError';
import { sendResponse } from '../utils/apiResponse';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const stringValue = (value: unknown) => (typeof value === 'string' ? value : undefined);

export class AuthController {
  static uploadAvatar = upload.single('image');

  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      const email = stringValue(req.body.email);
      const password = stringValue(req.body.password);
      if (!email || !password || password.length < 8) {
        throw ApiError.badRequest('email and password are required; password must be at least 8 characters');
      }

      const result = await AuthService.register({ email, password, name: stringValue(req.body.name) });
      const imageUrl = req.file
        ? await StorageService.uploadUserImage(result.user.id, {
            buffer: req.file.buffer, mimetype: req.file.mimetype, originalname: req.file.originalname,
          })
        : stringValue(req.body.imageUrl);
      const data = imageUrl ? { ...result, user: await AuthService.updateImage(result.user.id, imageUrl) } : result;
      res.setHeader('Authorization', `Bearer ${data.sessionToken}`);
      return sendResponse(res, { statusCode: 201, message: 'Registration successful' });
    } catch (error) {
      next(error);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const email = stringValue(req.body.email);
      const password = stringValue(req.body.password);
      if (!email || !password) throw ApiError.badRequest('email and password are required');
      const result = await AuthService.login(email, password);
      res.setHeader('Authorization', `Bearer ${result.sessionToken}`);
      return sendResponse(res, { message: 'Login successful' });
    } catch (error) {
      next(error);
    }
  }

  static async googleLogin(req: Request, res: Response, next: NextFunction) {
    try {
      const idToken = stringValue(req.body.idToken);
      if (!idToken) throw ApiError.badRequest('idToken is required');
      const result = await AuthService.loginWithGoogle(idToken);
      res.setHeader('Authorization', `Bearer ${result.sessionToken}`);
      return sendResponse(res, { message: 'Google login successful' });
    } catch (error) {
      next(error);
    }
  }
}
