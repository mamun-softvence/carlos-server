/*
  Warnings:

  - The `dayOfWeek` column on the `tutor_recurring_schedules` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "tutor_recurring_schedules" DROP COLUMN "dayOfWeek",
ADD COLUMN     "dayOfWeek" INTEGER[];
