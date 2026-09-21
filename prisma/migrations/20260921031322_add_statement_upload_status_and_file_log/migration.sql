-- CreateEnum
CREATE TYPE "StatementUploadStatus" AS ENUM ('PROCESSING', 'SUCCESS', 'FAILED');

-- AlterTable
ALTER TABLE "statement_uploads" ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "filePath" TEXT,
ADD COLUMN     "rawTextPreview" TEXT,
ADD COLUMN     "status" "StatementUploadStatus" NOT NULL DEFAULT 'PROCESSING',
ALTER COLUMN "monthlyAvgRevenue" DROP NOT NULL,
ALTER COLUMN "monthlyAvgExpense" DROP NOT NULL;
