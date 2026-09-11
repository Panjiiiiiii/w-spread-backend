import { MembershipStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database';

const ACTIVE_STATUSES = [MembershipStatus.ACTIVE, MembershipStatus.BILLING_ISSUE];

const statusMap: Record<string, MembershipStatus> = {
  INITIAL_PURCHASE: MembershipStatus.ACTIVE,
  RENEWAL: MembershipStatus.ACTIVE,
  PRODUCT_CHANGE: MembershipStatus.ACTIVE,
  UNCANCELLATION: MembershipStatus.ACTIVE,
  NON_RENEWING_PURCHASE: MembershipStatus.ACTIVE,
  BILLING_ISSUE: MembershipStatus.BILLING_ISSUE,
  CANCELLATION: MembershipStatus.CANCELED,
  EXPIRATION: MembershipStatus.EXPIRED,
  SUBSCRIPTION_PAUSED: MembershipStatus.PAUSED,
  SUBSCRIPTION_STARTED: MembershipStatus.ACTIVE,
};

export class MembershipService {
  static async linkRevenueCatUser(userId: string, appUserId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { revenueCatAppUserId: appUserId },
    });
  }

  static async getUserMembership(userId: string) {
    const subscriptions = await prisma.membershipSubscription.findMany({
      where: { userId, status: { in: ACTIVE_STATUSES } },
      orderBy: [{ expiresAt: 'desc' }, { updatedAt: 'desc' }],
    });
    const subscription = subscriptions.find(
      (item) => !item.expiresAt || item.expiresAt > new Date()
    );

    if (!subscription) {
      return {
        tier: null,
        role: 'The Owner',
        status: 'NONE',
        validDays: 0,
        totalDays: 0,
        expiresAt: null,
        autoRenewing: false,
      };
    }

    const entitlement = subscription.entitlementIdentifier?.toLowerCase() || '';
    const tier = entitlement.includes('enterprise')
      ? 'enterprise'
      : entitlement.includes('business')
        ? 'business'
        : null;
    const start = subscription.startsAt || subscription.purchasedAt || new Date();
    const end = subscription.expiresAt;
    const totalDays = end ? Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000)) : 0;
    const validDays = end ? Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000)) : totalDays;

    return {
      tier,
      role: tier === 'enterprise' ? 'The Enterprise' : tier === 'business' ? 'The Business Owner' : 'The Owner',
      status: subscription.status,
      validDays,
      totalDays,
      expiresAt: end,
      autoRenewing: subscription.autoRenewing ?? false,
    };
  }

  static async processRevenueCatEvent(eventId: string, payload: Record<string, unknown>) {
    const appUserId = typeof payload.app_user_id === 'string' ? payload.app_user_id : '';
    const eventType = typeof payload.type === 'string' ? payload.type : '';
    if (!appUserId || !eventType) throw new Error('RevenueCat webhook payload is missing app_user_id or type');

    const user = await prisma.user.findUnique({ where: { revenueCatAppUserId: appUserId } });
    const productIdentifier = typeof payload.product_id === 'string' ? payload.product_id : 'unknown';
    const entitlementIds = Array.isArray(payload.entitlement_ids) ? payload.entitlement_ids : [];
    const entitlementIdentifier = typeof entitlementIds[0] === 'string' ? entitlementIds[0] : null;
    const toDate = (value: unknown) => typeof value === 'number' ? new Date(value) : null;
    const status = statusMap[eventType] || MembershipStatus.INCOMPLETE;
    const data: Prisma.MembershipSubscriptionUncheckedCreateInput = {
      userId: user?.id || '',
      revenueCatAppUserId: appUserId,
      productIdentifier,
      entitlementIdentifier,
      status,
      originalTransactionId: typeof payload.original_transaction_id === 'string' ? payload.original_transaction_id : null,
      transactionId: typeof payload.transaction_id === 'string' ? payload.transaction_id : null,
      purchasedAt: toDate(payload.purchased_at_ms),
      startsAt: toDate(payload.starts_at_ms),
      expiresAt: toDate(payload.expiration_at_ms),
      canceledAt: status === MembershipStatus.CANCELED ? new Date() : null,
      autoRenewing: typeof payload.auto_renewal_status === 'string' ? payload.auto_renewal_status === 'AUTORENEW_ENABLED' : null,
      environment: typeof payload.environment === 'string' ? payload.environment : null,
      lastEventAt: toDate(payload.event_timestamp_ms) || new Date(),
    };

    await prisma.revenueCatEvent.upsert({
      where: { eventId },
      create: {
        eventId,
        revenueCatAppUserId: appUserId,
        userId: user?.id,
        eventType,
        eventCreatedAt: data.lastEventAt,
        payload: payload as Prisma.InputJsonValue,
      },
      update: {},
    });

    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { revenueCatAppUserId: appUserId },
      });
      await prisma.membershipSubscription.upsert({
        where: { userId_productIdentifier: { userId: user.id, productIdentifier } },
        create: data,
        update: { ...data, userId: undefined },
      });
    }
  }
}
