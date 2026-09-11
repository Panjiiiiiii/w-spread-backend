import { NextFunction, Request, Response } from 'express';
import { MembershipService } from '../services/membership.service';
import { ApiError } from '../utils/apiError';
import { sendResponse } from '../utils/apiResponse';
import { ENV } from '../config/env';

export class MembershipController {
  static async linkRevenueCatUser(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userId) throw ApiError.unauthorized('Authentication is required');
      const appUserId = typeof req.body?.appUserId === 'string' ? req.body.appUserId.trim() : '';
      if (!appUserId) throw ApiError.badRequest('appUserId is required');
      await MembershipService.linkRevenueCatUser(req.userId, appUserId);
      return sendResponse(res, { message: 'RevenueCat user linked' });
    } catch (error) {
      next(error);
    }
  }

  static async getMine(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userId) throw ApiError.unauthorized('Authentication is required');
      return sendResponse(res, { data: await MembershipService.getUserMembership(req.userId) });
    } catch (error) {
      next(error);
    }
  }

  static async revenueCatWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      const configuredSecret = ENV.REVENUECAT_WEBHOOK_SECRET;
      if (!configuredSecret || req.get('Authorization') !== `Bearer ${configuredSecret}`) {
        throw ApiError.unauthorized('Invalid RevenueCat webhook authorization');
      }
      const event = req.body?.event;
      if (!event?.id) throw ApiError.badRequest('RevenueCat webhook event is required');
      await MembershipService.processRevenueCatEvent(String(event.id), event);
      return sendResponse(res, { message: 'RevenueCat event processed' });
    } catch (error) {
      next(error);
    }
  }
}
