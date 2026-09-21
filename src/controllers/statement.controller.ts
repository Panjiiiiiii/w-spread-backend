import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { StatementService } from '../services/statement.service';
import { ApiError } from '../utils/apiError';
import { sendResponse } from '../utils/apiResponse';

const MAX_STATEMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB, matches the frontend dropzone copy

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_STATEMENT_SIZE_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype !== 'application/pdf') {
      callback(ApiError.badRequest('Only PDF e-statements are supported.'));
      return;
    }
    callback(null, true);
  },
});

export class StatementController {
  static uploadPdf = upload.single('file');

  static async upload(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userId) throw ApiError.unauthorized('Authentication is required');
      if (!req.file) throw ApiError.badRequest('A PDF file is required (field name: "file").');

      const summary = await StatementService.processPdf(
        req.userId,
        req.file.buffer,
        req.file.originalname || 'statement.pdf'
      );

      return sendResponse(res, { statusCode: 201, message: 'Statement processed successfully', data: summary });
    } catch (error) {
      next(error);
    }
  }

  static async latest(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userId) throw ApiError.unauthorized('Authentication is required');
      return sendResponse(res, { data: await StatementService.getLatest(req.userId) });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /statements — paginated upload history for the current user,
   * newest first. Deliberately excludes `filePath`/signed URLs; use the
   * `/statements/:id/file` endpoint for that, scoped per item.
   */
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userId) throw ApiError.unauthorized('Authentication is required');
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const result = await StatementService.list(req.userId, page, limit);
      return sendResponse(res, {
        data: result.items,
        meta: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /statements/:id — single upload detail, same shape as the list
   * items but with the fuller summary (period, averages, categories).
   */
  static async detail(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userId) throw ApiError.unauthorized('Authentication is required');
      const id = String(req.params.id || '');
      const summary = await StatementService.getById(req.userId, id);
      if (!summary) throw ApiError.notFound('Statement upload not found');
      return sendResponse(res, { data: summary });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /statements/:id/file — returns a fresh, short-lived signed URL for
   * the original PDF. Never returns the raw `filePath`/bucket object
   * directly. Throws 403 if the statement upload belongs to another user,
   * 404 if it doesn't exist or has no stored file.
   */
  static async file(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userId) throw ApiError.unauthorized('Authentication is required');
      const id = String(req.params.id || '');
      const url = await StatementService.getFileSignedUrl(req.userId, id);
      return sendResponse(res, { data: { url } });
    } catch (error) {
      next(error);
    }
  }
}
