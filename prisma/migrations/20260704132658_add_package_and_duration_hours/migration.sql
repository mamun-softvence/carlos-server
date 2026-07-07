/*
  Warnings:

  - You are about to drop the column `durationMinutes` on the `tutor_recurring_schedules` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "isPackage" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tutor_recurring_schedules" DROP COLUMN "durationMinutes",
ADD COLUMN     "durationHours" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "isPackage" BOOLEAN NOT NULL DEFAULT true;
