-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('GOOGLE');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'BILLING_ISSUE', 'CANCELED', 'EXPIRED', 'PAUSED', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "SubscriptionStore" AS ENUM ('APP_STORE', 'PLAY_STORE', 'STRIPE', 'PROMOTIONAL', 'UNKNOWN');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "imageUrl" TEXT,
    "passwordHash" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "role" "Role" NOT NULL DEFAULT 'USER',
    "revenueCatAppUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productIdentifier" TEXT NOT NULL,
    "entitlementIdentifier" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT,
    "revenueCatAppUserId" TEXT NOT NULL,
    "productIdentifier" TEXT NOT NULL,
    "entitlementIdentifier" TEXT,
    "store" "SubscriptionStore" NOT NULL DEFAULT 'UNKNOWN',
    "status" "MembershipStatus" NOT NULL,
    "originalTransactionId" TEXT,
    "transactionId" TEXT,
    "purchasedAt" TIMESTAMP(3),
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "autoRenewing" BOOLEAN,
    "environment" TEXT,
    "lastEventAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenuecat_events" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT,
    "revenueCatAppUserId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventCreatedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,

    CONSTRAINT "revenuecat_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_revenueCatAppUserId_key" ON "users"("revenueCatAppUserId");

-- CreateIndex
CREATE INDEX "auth_accounts_userId_idx" ON "auth_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "auth_accounts_provider_providerAccountId_key" ON "auth_accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionTokenHash_key" ON "sessions"("sessionTokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_expiresAt_idx" ON "sessions"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "membership_plans_productIdentifier_key" ON "membership_plans"("productIdentifier");

-- CreateIndex
CREATE INDEX "membership_plans_entitlementIdentifier_idx" ON "membership_plans"("entitlementIdentifier");

-- CreateIndex
CREATE INDEX "membership_subscriptions_revenueCatAppUserId_idx" ON "membership_subscriptions"("revenueCatAppUserId");

-- CreateIndex
CREATE INDEX "membership_subscriptions_status_expiresAt_idx" ON "membership_subscriptions"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "membership_subscriptions_originalTransactionId_idx" ON "membership_subscriptions"("originalTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "membership_subscriptions_userId_productIdentifier_key" ON "membership_subscriptions"("userId", "productIdentifier");

-- CreateIndex
CREATE UNIQUE INDEX "revenuecat_events_eventId_key" ON "revenuecat_events"("eventId");

-- CreateIndex
CREATE INDEX "revenuecat_events_revenueCatAppUserId_eventCreatedAt_idx" ON "revenuecat_events"("revenueCatAppUserId", "eventCreatedAt");

-- CreateIndex
CREATE INDEX "revenuecat_events_eventType_eventCreatedAt_idx" ON "revenuecat_events"("eventType", "eventCreatedAt");

-- AddForeignKey
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_subscriptions" ADD CONSTRAINT "membership_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_subscriptions" ADD CONSTRAINT "membership_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "membership_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenuecat_events" ADD CONSTRAINT "revenuecat_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
