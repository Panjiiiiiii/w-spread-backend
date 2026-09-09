import { Response } from 'express';

export interface ApiResponseOptions<T> {
  statusCode?: number;
  message?: string;
  data?: T;
  meta?: Record<string, unknown>;
}

export const sendResponse = <T>(
  res: Response,
  { statusCode = 200, message = 'Success', data, meta }: ApiResponseOptions<T>
) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    meta,
  });
};

export const sendError = (
  res: Response,
  statusCode = 500,
  message = 'Internal Server Error',
  errors?: unknown
) => {
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
  });
};
