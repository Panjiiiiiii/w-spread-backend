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
}
