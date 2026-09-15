import { MembershipStatus, Prisma, SubscriptionStore } from '@prisma/client';
import { prisma } from '../config/database';

const ACTIVE_STATUSES = [MembershipStatus.ACTIVE, MembershipStatus.BILLING_ISSUE];

// Covers every RevenueCat webhook `type` we may receive, including sandbox/test
// delivery (`TEST`), so a dashboard test event or sandbox purchase never gets
// stuck in INCOMPLETE and silently excluded from ACTIVE_STATUSES.
// Reference: https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
const statusMap: Record<string, MembershipStatus> = {
  TEST: MembershipStatus.ACTIVE,
  INITIAL_PURCHASE: MembershipStatus.ACTIVE,
  RENEWAL: MembershipStatus.ACTIVE,
  PRODUCT_CHANGE: MembershipStatus.ACTIVE,
  UNCANCELLATION: MembershipStatus.ACTIVE,
  NON_RENEWING_PURCHASE: MembershipStatus.ACTIVE,
  SUBSCRIPTION_EXTENDED: MembershipStatus.ACTIVE,
  REFUND_REVERSED: MembershipStatus.ACTIVE,
  TEMPORARY_ENTITLEMENT_GRANT: MembershipStatus.ACTIVE,
  BILLING_ISSUE: MembershipStatus.BILLING_ISSUE,
  CANCELLATION: MembershipStatus.CANCELED,
  EXPIRATION: MembershipStatus.EXPIRED,
  SUBSCRIPTION_PAUSED: MembershipStatus.PAUSED,
  SUBSCRIPTION_STARTED: MembershipStatus.ACTIVE,
};

// RevenueCat's `store` field uses values our SubscriptionStore enum doesn't fully
// mirror (AMAZON, MAC_APP_STORE, PADDLE, RC_BILLING, ROKU, TEST_STORE). Anything
// unrecognized falls back to UNKNOWN rather than throwing.
function mapStore(store: unknown): SubscriptionStore {
  if (typeof store !== 'string') return SubscriptionStore.UNKNOWN;
  switch (store) {
    case 'APP_STORE':
      return SubscriptionStore.APP_STORE;
    case 'PLAY_STORE':
      return SubscriptionStore.PLAY_STORE;
    case 'STRIPE':
      return SubscriptionStore.STRIPE;
    case 'PROMOTIONAL':
      return SubscriptionStore.PROMOTIONAL;
    default:
      return SubscriptionStore.UNKNOWN;
  }
}

type SubscriptionData = Prisma.MembershipSubscriptionUncheckedCreateInput;

/**
 * Snapshot of the client's live RevenueCat `CustomerInfo` for a single active
 * entitlement, submitted right after a purchase/restore completes. Treated as
 * a fast local cache write only — never authoritative for billing decisions.
 * The RevenueCat webhook remains the durable/reconciling source of truth and
 * is free to overwrite the row this produces (same upsert key).
 */
export interface RevenueCatClientSnapshot {
  appUserId?: string;
  productIdentifier?: string;
  entitlementIdentifier?: string | null;
  purchasedAtMs?: number | null;
  expiresAtMs?: number | null;
  willRenew?: boolean | null;
  store?: string | null;
  isSandbox?: boolean | null;
  billingIssueDetectedAtMs?: number | null;
  originalTransactionId?: string | null;
  transactionId?: string | null;
}

export class MembershipService {
  static async linkRevenueCatUser(userId: string, appUserId: string) {
    const existingUser = await prisma.user.findUnique({
      where: { revenueCatAppUserId: appUserId },
      select: { id: true },
    });
    if (existingUser && existingUser.id !== userId) {
      throw new Error('RevenueCat app user is already linked to another account');
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { revenueCatAppUserId: appUserId },
    });

    const pendingEvents = await prisma.revenueCatEvent.findMany({
      where: {
        revenueCatAppUserId: appUserId,
        userId: null,
      },
      orderBy: { eventCreatedAt: 'asc' },
    });

    for (const pendingEvent of pendingEvents) {
      await this.processRevenueCatEvent(
        pendingEvent.eventId,
        pendingEvent.payload as Record<string, unknown>,
      );
    }

    return user;
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

    const entitlement = subscription.entitlementIdentifier?.toLowerCase()
      || subscription.productIdentifier.toLowerCase();
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

  /**
   * Shared upsert for writing a MembershipSubscription row. Used by both the
   * webhook path (`processRevenueCatEvent`) and the client sync path
   * (`syncFromClient`) so there is one code path for writing subscription rows.
   */
  private static async upsertSubscription(
    userId: string,
    productIdentifier: string,
    data: SubscriptionData
  ) {
    await prisma.user.update({
      where: { id: userId },
      data: { revenueCatAppUserId: data.revenueCatAppUserId },
    });
    return prisma.membershipSubscription.upsert({
      where: { userId_productIdentifier: { userId, productIdentifier } },
      create: data,
      update: { ...data, userId: undefined },
    });
  }

  static async processRevenueCatEvent(eventId: string, payload: Record<string, unknown>) {
    const appUserId = typeof payload.app_user_id === 'string' ? payload.app_user_id : '';
    const eventType = typeof payload.type === 'string' ? payload.type : '';
    if (!appUserId || !eventType) throw new Error('RevenueCat webhook payload is missing app_user_id or type');

    const aliases = Array.isArray(payload.aliases)
      ? payload.aliases.filter((value): value is string => typeof value === 'string')
      : [];
    const user = await prisma.user.findFirst({
      where: { revenueCatAppUserId: { in: [appUserId, ...aliases] } },
    });

    console.log('[RevenueCat webhook] processing event', {
      eventId,
      eventType,
      appUserId,
      userFound: Boolean(user),
      userId: user?.id ?? null,
    });

    const productIdentifier = typeof payload.product_id === 'string' ? payload.product_id : 'unknown';
    const entitlementIds = Array.isArray(payload.entitlement_ids) ? payload.entitlement_ids : [];
    const entitlementIdentifier = typeof entitlementIds[0] === 'string'
      ? entitlementIds[0]
      : productIdentifier.includes('enterprise')
        ? 'enterprise'
        : productIdentifier.includes('business')
          ? 'business'
          : null;
    const toDate = (value: unknown) => typeof value === 'number' ? new Date(value) : null;
    const status = statusMap[eventType] || MembershipStatus.INCOMPLETE;
    if (!statusMap[eventType]) {
      console.warn('[RevenueCat webhook] unmapped event type, defaulting to INCOMPLETE', { eventId, eventType });
    }
    const eventDate = toDate(payload.event_timestamp_ms) || new Date();
    const plan = await prisma.membershipPlan.findUnique({
      where: { productIdentifier },
      select: { id: true },
    });

    await prisma.revenueCatEvent.upsert({
      where: { eventId },
      create: {
        eventId,
        revenueCatAppUserId: appUserId,
        userId: user?.id,
        eventType,
        eventCreatedAt: eventDate,
        payload: payload as Prisma.InputJsonValue,
      },
      update: {
        userId: user?.id,
      },
    });

    // RevenueCat may deliver the webhook before the app-user link request.
    // Keep the event so linkRevenueCatUser can replay it after linking.
    if (!user) {
      console.warn('[RevenueCat webhook] no matching user for app_user_id, event stored as pending', {
        eventId,
        eventType,
        appUserId,
      });
      return;
    }

    const data: SubscriptionData = {
      userId: user.id,
      planId: plan?.id || null,
      revenueCatAppUserId: appUserId,
      productIdentifier,
      entitlementIdentifier,
      store: mapStore(payload.store),
      status,
      originalTransactionId: typeof payload.original_transaction_id === 'string' ? payload.original_transaction_id : null,
      transactionId: typeof payload.transaction_id === 'string' ? payload.transaction_id : null,
      purchasedAt: toDate(payload.purchased_at_ms),
      startsAt: toDate(payload.starts_at_ms),
      expiresAt: toDate(payload.expiration_at_ms),
      canceledAt: status === MembershipStatus.CANCELED ? new Date() : null,
      autoRenewing: typeof payload.auto_renewal_status === 'string' ? payload.auto_renewal_status === 'AUTORENEW_ENABLED' : null,
      environment: typeof payload.environment === 'string' ? payload.environment : null,
      lastEventAt: eventDate,
    };

    await this.upsertSubscription(user.id, productIdentifier, data);
  }

  /**
   * Fast local-cache write triggered by the client right after a successful
   * purchase/restore, so the badge/tier doesn't have to wait for the async
   * RevenueCat webhook. NOT authoritative for billing: the webhook can and
   * will overwrite this row later via the same upsert key
   * (`userId_productIdentifier`), reconciling with RevenueCat's server truth.
   */
  static async syncFromClient(userId: string, snapshot: RevenueCatClientSnapshot) {
    const productIdentifier = snapshot.productIdentifier?.trim() || 'unknown';
    const entitlementIdentifier = snapshot.entitlementIdentifier?.trim()
      || (productIdentifier.includes('enterprise')
        ? 'enterprise'
        : productIdentifier.includes('business')
          ? 'business'
          : null);
    const appUserId = snapshot.appUserId?.trim() || undefined;

    console.log('[Membership sync] client-submitted snapshot', {
      userId,
      productIdentifier,
      entitlementIdentifier,
      appUserId: appUserId ?? null,
    });

    const plan = await prisma.membershipPlan.findUnique({
      where: { productIdentifier },
      select: { id: true },
    });

    const toDate = (value?: number | null) => (typeof value === 'number' ? new Date(value) : null);
    const now = new Date();

    const data: SubscriptionData = {
      userId,
      planId: plan?.id || null,
      revenueCatAppUserId: appUserId || productIdentifier,
      productIdentifier,
      entitlementIdentifier,
      store: mapStore(snapshot.store),
      status: MembershipStatus.ACTIVE,
      originalTransactionId: snapshot.originalTransactionId || null,
      transactionId: snapshot.transactionId || null,
      purchasedAt: toDate(snapshot.purchasedAtMs) || now,
      startsAt: toDate(snapshot.purchasedAtMs) || now,
      expiresAt: toDate(snapshot.expiresAtMs),
      canceledAt: null,
      autoRenewing: snapshot.willRenew ?? null,
      environment: snapshot.isSandbox ? 'SANDBOX' : 'PRODUCTION',
      lastEventAt: now,
    };

    // If we don't have a RevenueCat app user id from the client, fall back to
    // whatever is already linked so we don't clobber it with a placeholder.
    if (!appUserId) {
      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { revenueCatAppUserId: true },
      });
      data.revenueCatAppUserId = existingUser?.revenueCatAppUserId || productIdentifier;
    }

    await this.upsertSubscription(userId, productIdentifier, data);

    return this.getUserMembership(userId);
  }
}
