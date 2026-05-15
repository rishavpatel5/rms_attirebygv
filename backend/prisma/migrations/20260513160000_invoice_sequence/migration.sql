-- CreateTable
CREATE TABLE "invoice_sequence" (
    "id" TEXT NOT NULL,
    "next_seq" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_sequence_pkey" PRIMARY KEY ("id")
);

INSERT INTO "invoice_sequence" ("id", "next_seq", "updated_at")
VALUES ('singleton', 0, CURRENT_TIMESTAMP);
