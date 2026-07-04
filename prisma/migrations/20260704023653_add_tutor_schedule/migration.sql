-- CreateEnum
CREATE TYPE "TutorBookingType" AS ENUM ('CASUAL', 'RECURRING');

-- CreateEnum
CREATE TYPE "RecurringFrequency" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_studentId_fkey";

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "recurringScheduleId" TEXT,
ADD COLUMN     "tags" TEXT[],
ADD COLUMN     "tutorBookingType" "TutorBookingType",
ALTER COLUMN "studentId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "tutor_recurring_schedules" (
    "id" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "studentId" TEXT,
    "title" TEXT,
    "description" TEXT,
    "tags" TEXT[],
    "frequency" "RecurringFrequency" NOT NULL DEFAULT 'WEEKLY',
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "timeOfDay" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 50,
    "openingWindowDays" INTEGER NOT NULL DEFAULT 7,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastGeneratedUpTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_recurring_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tutor_recurring_schedules_tutorId_idx" ON "tutor_recurring_schedules"("tutorId");

-- CreateIndex
CREATE INDEX "tutor_recurring_schedules_isActive_idx" ON "tutor_recurring_schedules"("isActive");

-- CreateIndex
CREATE INDEX "bookings_recurringScheduleId_idx" ON "bookings"("recurringScheduleId");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_recurringScheduleId_fkey" FOREIGN KEY ("recurringScheduleId") REFERENCES "tutor_recurring_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_recurring_schedules" ADD CONSTRAINT "tutor_recurring_schedules_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_recurring_schedules" ADD CONSTRAINT "tutor_recurring_schedules_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
