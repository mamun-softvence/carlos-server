-- CreateTable
CREATE TABLE "student_log_competencies" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "bookingId" TEXT,
    "input" INTEGER NOT NULL DEFAULT 0,
    "output" INTEGER NOT NULL DEFAULT 0,
    "architecture" INTEGER NOT NULL DEFAULT 0,
    "lexicon" INTEGER NOT NULL DEFAULT 0,
    "dynamics" INTEGER NOT NULL DEFAULT 0,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "territoryExpansion" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_log_competencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_log_competencies_studentId_idx" ON "student_log_competencies"("studentId");

-- CreateIndex
CREATE INDEX "student_log_competencies_tutorId_idx" ON "student_log_competencies"("tutorId");

-- CreateIndex
CREATE INDEX "student_log_competencies_bookingId_idx" ON "student_log_competencies"("bookingId");

-- AddForeignKey
ALTER TABLE "student_log_competencies" ADD CONSTRAINT "student_log_competencies_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_log_competencies" ADD CONSTRAINT "student_log_competencies_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_log_competencies" ADD CONSTRAINT "student_log_competencies_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
