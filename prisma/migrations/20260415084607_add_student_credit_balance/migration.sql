-- CreateTable
CREATE TABLE "student_credit_balances" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "totalCredits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_credit_balances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_credit_balances_studentId_key" ON "student_credit_balances"("studentId");

-- AddForeignKey
ALTER TABLE "student_credit_balances" ADD CONSTRAINT "student_credit_balances_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
