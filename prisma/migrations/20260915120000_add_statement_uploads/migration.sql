-- CreateEnum
CREATE TYPE "TransactionSource" AS ENUM ('MANUAL', 'STATEMENT_UPLOAD');

-- CreateEnum
CREATE TYPE "StatementBank" AS ENUM ('BCA', 'MANDIRI', 'BRI', 'UNKNOWN');

-- AlterTable
ALTER TABLE "transactions"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "source" "TransactionSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "statementUploadId" TEXT;

-- CreateTable
CREATE TABLE "statement_uploads" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "bank" "StatementBank" NOT NULL DEFAULT 'UNKNOWN',
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "monthlyAvgRevenue" DECIMAL(14,2) NOT NULL,
    "monthlyAvgExpense" DECIMAL(14,2) NOT NULL,
    "totalMonths" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "statement_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "statement_uploads_userId_createdAt_idx" ON "statement_uploads"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "transactions_statementUploadId_idx" ON "transactions"("statementUploadId");

-- AddForeignKey
ALTER TABLE "statement_uploads" ADD CONSTRAINT "statement_uploads_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_statementUploadId_fkey"
  FOREIGN KEY ("statementUploadId") REFERENCES "statement_uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
