import { NextFunction, Request, Response } from 'express';
import { PredictionService } from '../services/prediction.service';
import { ApiError } from '../utils/apiError';
import { sendResponse } from '../utils/apiResponse';

function positiveNumber(value: unknown, name: string, fallback?: number) {
  const parsed = value === undefined && fallback !== undefined ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw ApiError.badRequest(`${name} must be a non-negative number`);
  }
  return parsed;
}

export class PredictionController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userId) throw ApiError.unauthorized('Authentication is required');
      const timeframeMonths = positiveNumber(req.body?.timeframeMonths, 'timeframeMonths', 12);
      if (!Number.isInteger(timeframeMonths) || timeframeMonths < 1 || timeframeMonths > 120) {
        throw ApiError.badRequest('timeframeMonths must be an integer between 1 and 120');
      }
      const result = await PredictionService.create(req.userId, {
        timeframeMonths,
        payrollImpact: positiveNumber(req.body?.payrollImpact, 'payrollImpact', 0),
        vendorImpact: positiveNumber(req.body?.vendorImpact, 'vendorImpact', 0),
      });
      return sendResponse(res, { statusCode: 201, data: result });
    } catch (error) {
      next(error);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userId) throw ApiError.unauthorized('Authentication is required');
      return sendResponse(res, { data: await PredictionService.list(req.userId) });
    } catch (error) {
      next(error);
    }
  }
}
