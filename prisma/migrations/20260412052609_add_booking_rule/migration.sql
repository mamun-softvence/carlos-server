-- CreateTable
CREATE TABLE "booking_rules" (
    "id" TEXT NOT NULL,
    "minimumNoticeHours" INTEGER NOT NULL DEFAULT 24,
    "cancellationHours" INTEGER NOT NULL DEFAULT 12,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_rules_pkey" PRIMARY KEY ("id")
);
