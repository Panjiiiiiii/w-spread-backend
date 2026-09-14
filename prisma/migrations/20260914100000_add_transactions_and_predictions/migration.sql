-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('REVENUE', 'EXPENSE');

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "type" "TransactionType" NOT NULL,
    "category" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "predictions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentBalance" DECIMAL(14,2) NOT NULL,
    "predictedBalance" DECIMAL(14,2) NOT NULL,
    "conservativeBalance" DECIMAL(14,2) NOT NULL,
    "timeframeMonths" INTEGER NOT NULL,
    "averageMonthlyRevenue" DECIMAL(14,2) NOT NULL,
    "averageMonthlyExpenses" DECIMAL(14,2) NOT NULL,
    "payrollImpact" DECIMAL(14,2) NOT NULL,
    "vendorImpact" DECIMAL(14,2) NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "predictions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transactions_userId_occurredAt_idx" ON "transactions"("userId", "occurredAt");
CREATE INDEX "predictions_userId_createdAt_idx" ON "predictions"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- These policies protect direct Supabase client access. The Prisma API uses
-- the database service connection and still scopes every query by userId.
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "predictions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transactions_owner_select" ON "transactions"
  FOR SELECT USING (auth.uid()::text = "userId");
CREATE POLICY "transactions_owner_insert" ON "transactions"
  FOR INSERT WITH CHECK (auth.uid()::text = "userId");
CREATE POLICY "predictions_owner_select" ON "predictions"
  FOR SELECT USING (auth.uid()::text = "userId");
CREATE POLICY "predictions_owner_insert" ON "predictions"
  FOR INSERT WITH CHECK (auth.uid()::text = "userId");
