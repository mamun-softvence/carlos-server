-- AlterTable
ALTER TABLE "users"
ADD COLUMN "phoneNumber" TEXT,
ADD COLUMN "timeZone" TEXT,
ADD COLUMN "googleCalendarEnabled" BOOLEAN NOT NULL DEFAULT false;
