-- CreateTable
CREATE TABLE "saved_live_class_messages" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "saved_live_class_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "saved_live_class_messages_messageId_key" ON "saved_live_class_messages"("messageId");

-- CreateIndex
CREATE INDEX "saved_live_class_messages_bookingId_createdAt_idx" ON "saved_live_class_messages"("bookingId", "createdAt");

-- AddForeignKey
ALTER TABLE "saved_live_class_messages" ADD CONSTRAINT "saved_live_class_messages_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_live_class_messages" ADD CONSTRAINT "saved_live_class_messages_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "live_class_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_live_class_messages" ADD CONSTRAINT "saved_live_class_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
