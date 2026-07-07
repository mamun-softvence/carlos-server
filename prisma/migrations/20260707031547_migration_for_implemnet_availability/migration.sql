-- AlterEnum
ALTER TYPE "LessonType" ADD VALUE 'BOTH';

-- CreateTable
CREATE TABLE "tutor_availabilities" (
    "id" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 50,
    "isBooked" BOOLEAN NOT NULL DEFAULT false,
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_availabilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tutor_availabilities_bookingId_key" ON "tutor_availabilities"("bookingId");

-- CreateIndex
CREATE INDEX "tutor_availabilities_tutorId_idx" ON "tutor_availabilities"("tutorId");

-- CreateIndex
CREATE INDEX "tutor_availabilities_scheduledAt_idx" ON "tutor_availabilities"("scheduledAt");

-- AddForeignKey
ALTER TABLE "tutor_availabilities" ADD CONSTRAINT "tutor_availabilities_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_availabilities" ADD CONSTRAINT "tutor_availabilities_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
