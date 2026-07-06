-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "groupBookingId" TEXT;

-- CreateIndex
CREATE INDEX "bookings_groupBookingId_idx" ON "bookings"("groupBookingId");
