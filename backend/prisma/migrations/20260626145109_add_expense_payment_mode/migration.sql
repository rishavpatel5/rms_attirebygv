-- CreateEnum
CREATE TYPE "ExpensePaymentMode" AS ENUM ('CASH', 'UPI');

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "payment_mode" "ExpensePaymentMode" NOT NULL DEFAULT 'CASH';
