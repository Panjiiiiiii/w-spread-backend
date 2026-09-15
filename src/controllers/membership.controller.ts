import { NextFunction, Request, Response } from 'express';
import { MembershipService, RevenueCatClientSnapshot } from '../services/membership.service';
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

  /**
   * Fast local sync triggered by the client immediately after a successful
   * purchase or restore. This is NOT authoritative for billing — it's a cache
   * write so the UI doesn't have to wait on the async RevenueCat webhook. The
   * webhook remains the durable/reconciling source of truth and can safely
   * overwrite whatever this writes (same upsert key).
   */
  static async sync(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userId) throw ApiError.unauthorized('Authentication is required');
      const body = req.body || {};
      const snapshot: RevenueCatClientSnapshot = {
        appUserId: typeof body.appUserId === 'string' ? body.appUserId : undefined,
        productIdentifier: typeof body.productIdentifier === 'string' ? body.productIdentifier : undefined,
        entitlementIdentifier: typeof body.entitlementIdentifier === 'string' ? body.entitlementIdentifier : null,
        purchasedAtMs: typeof body.purchasedAtMs === 'number' ? body.purchasedAtMs : null,
        expiresAtMs: typeof body.expiresAtMs === 'number' ? body.expiresAtMs : null,
        willRenew: typeof body.willRenew === 'boolean' ? body.willRenew : null,
        store: typeof body.store === 'string' ? body.store : null,
        isSandbox: typeof body.isSandbox === 'boolean' ? body.isSandbox : null,
        originalTransactionId: typeof body.originalTransactionId === 'string' ? body.originalTransactionId : null,
        transactionId: typeof body.transactionId === 'string' ? body.transactionId : null,
      };
      if (!snapshot.productIdentifier && !snapshot.entitlementIdentifier) {
        throw ApiError.badRequest('productIdentifier or entitlementIdentifier is required');
      }
      const data = await MembershipService.syncFromClient(req.userId, snapshot);
      return sendResponse(res, { data });
    } catch (error) {
      next(error);
    }
  }

  static async revenueCatWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      const configuredSecret = ENV.REVENUECAT_WEBHOOK_SECRET;
      const authorization = req.get('Authorization');
      const event = req.body?.event;
      console.log('[RevenueCat webhook] received', {
        eventId: event?.id ?? null,
        eventType: event?.type ?? null,
        appUserId: event?.app_user_id ?? null,
        hasAuthorizationHeader: Boolean(authorization),
      });
      if (!configuredSecret || authorization !== `Bearer ${configuredSecret}`) {
        console.warn('[RevenueCat webhook] rejected: invalid or missing authorization', {
          eventId: event?.id ?? null,
          hasConfiguredSecret: Boolean(configuredSecret),
        });
        throw ApiError.unauthorized('Invalid RevenueCat webhook authorization');
      }
      if (!event?.id) throw ApiError.badRequest('RevenueCat webhook event is required');
      await MembershipService.processRevenueCatEvent(String(event.id), event);
      return sendResponse(res, { message: 'RevenueCat event processed' });
    } catch (error) {
      next(error);
    }
  }
}
