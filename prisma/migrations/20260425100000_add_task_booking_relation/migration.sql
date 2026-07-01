ALTER TABLE "tasks"
ADD COLUMN "bookingId" TEXT;

CREATE INDEX "tasks_bookingId_idx" ON "tasks"("bookingId");

ALTER TABLE "tasks"
ADD CONSTRAINT "tasks_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
