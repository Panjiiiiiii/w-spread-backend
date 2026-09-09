import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/apiError';
import { sendError } from '../utils/apiResponse';
import { ENV } from '../config/env';
import multer from 'multer';

export const errorHandler = (
  err: Error | ApiError,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) => {
  let statusCode = 500;
  let message = 'Internal Server Error';
  let errors: unknown = undefined;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors;
  } else if (err instanceof Error) {
    if (err instanceof multer.MulterError) {
      statusCode = 400;
      message = err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5 MB or smaller' : err.message;
    } else {
      message = err.message;
    }
    if (ENV.NODE_ENV === 'development') {
      errors = err.stack;
    }
  }

  return sendError(res, statusCode, message, errors);
};
