-- CreateEnum
CREATE TYPE "CapitalEntryType" AS ENUM ('INVESTMENT', 'DRAWING');

-- CreateTable
CREATE TABLE "capital_entries" (
    "id" TEXT NOT NULL,
    "type" "CapitalEntryType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" DATE NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capital_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "capital_entries_date_idx" ON "capital_entries"("date" DESC);

-- CreateIndex
CREATE INDEX "capital_entries_type_idx" ON "capital_entries"("type");
