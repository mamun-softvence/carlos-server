-- AlterTable
ALTER TABLE "users"
ADD COLUMN "googleCalendarEmail" TEXT,
ADD COLUMN "googleCalendarAccessToken" TEXT,
ADD COLUMN "googleCalendarRefreshToken" TEXT,
ADD COLUMN "googleCalendarTokenExpiry" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "google_calendar_booking_events" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_calendar_booking_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_calendar_booking_events_bookingId_userId_key" ON "google_calendar_booking_events"("bookingId", "userId");

-- CreateIndex
CREATE INDEX "google_calendar_booking_events_bookingId_idx" ON "google_calendar_booking_events"("bookingId");

-- CreateIndex
CREATE INDEX "google_calendar_booking_events_userId_idx" ON "google_calendar_booking_events"("userId");

-- AddForeignKey
ALTER TABLE "google_calendar_booking_events" ADD CONSTRAINT "google_calendar_booking_events_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_calendar_booking_events" ADD CONSTRAINT "google_calendar_booking_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
