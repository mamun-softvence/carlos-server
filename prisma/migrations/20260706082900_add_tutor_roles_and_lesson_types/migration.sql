-- CreateEnum
CREATE TYPE "TutorSubRole" AS ENUM ('REGULAR', 'CONVERSATION');

-- CreateEnum
CREATE TYPE "LessonType" AS ENUM ('REGULAR', 'CONVERSATION');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "tutorRoles" "TutorSubRole"[] NOT NULL DEFAULT ARRAY[]::"TutorSubRole"[];

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN "lessonType" "LessonType" NOT NULL DEFAULT 'REGULAR';

-- AlterTable
ALTER TABLE "tutor_recurring_schedules" ADD COLUMN "lessonType" "LessonType" NOT NULL DEFAULT 'REGULAR';

-- Migrate existing data
UPDATE "users" 
SET "tutorRoles" = ARRAY['REGULAR']::"TutorSubRole"[] 
WHERE "role" = 'TUTOR';

UPDATE "users" 
SET "tutorRoles" = ARRAY[]::"TutorSubRole"[] 
WHERE "role" = 'STUDENT';
