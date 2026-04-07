/*
  Warnings:

  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingCreatedBy" AS ENUM ('STUDENT', 'TUTOR', 'ADMIN');

-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'STUDENT',
    "avatarUrl" TEXT,
    "provider" "AuthProvider" NOT NULL DEFAULT 'EMAIL',
    "providerId" TEXT,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "acceptedTerms" BOOLEAN NOT NULL DEFAULT false,
    "refreshToken" TEXT,
    "resetCode" TEXT,
    "resetCodeExpiry" TIMESTAMP(3),
    "resetVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tutorId" TEXT,
    "assignedByAdminId" TEXT,
    "createdBy" "BookingCreatedBy" NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "topic" TEXT,
    "note" TEXT,
    "requestedDate" TIMESTAMP(3),
    "requestedTimeLabel" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_providerId_key" ON "users"("providerId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "bookings_studentId_idx" ON "bookings"("studentId");

-- CreateIndex
CREATE INDEX "bookings_tutorId_idx" ON "bookings"("tutorId");

-- CreateIndex
CREATE INDEX "bookings_assignedByAdminId_idx" ON "bookings"("assignedByAdminId");

-- CreateIndex
CREATE INDEX "bookings_status_idx" ON "bookings"("status");

-- CreateIndex
CREATE INDEX "bookings_scheduledAt_idx" ON "bookings"("scheduledAt");

-- CreateIndex
CREATE INDEX "bookings_createdBy_idx" ON "bookings"("createdBy");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_assignedByAdminId_fkey" FOREIGN KEY ("assignedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
