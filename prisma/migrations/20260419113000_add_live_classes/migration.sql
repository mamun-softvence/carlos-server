-- CreateEnum
CREATE TYPE "LiveClassStatus" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED');

-- AlterTable
ALTER TABLE "bookings"
ADD COLUMN "courseReference" TEXT,
ADD COLUMN "moduleReference" TEXT,
ADD COLUMN "liveClassStatus" "LiveClassStatus" NOT NULL DEFAULT 'SCHEDULED',
ADD COLUMN "startedAt" TIMESTAMP(3),
ADD COLUMN "endedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "live_class_messages" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_class_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bookings_liveClassStatus_idx" ON "bookings"("liveClassStatus");

-- CreateIndex
CREATE INDEX "live_class_messages_bookingId_createdAt_idx" ON "live_class_messages"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "live_class_messages_senderId_idx" ON "live_class_messages"("senderId");

-- AddForeignKey
ALTER TABLE "live_class_messages" ADD CONSTRAINT "live_class_messages_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_messages" ADD CONSTRAINT "live_class_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
