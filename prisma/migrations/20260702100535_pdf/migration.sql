-- CreateTable
CREATE TABLE "session_shared_pdfs" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pdfUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_shared_pdfs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_shared_pdfs_bookingId_createdAt_idx" ON "session_shared_pdfs"("bookingId", "createdAt");

-- AddForeignKey
ALTER TABLE "session_shared_pdfs" ADD CONSTRAINT "session_shared_pdfs_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
