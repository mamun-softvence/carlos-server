ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'INCOMPLETE';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PAST_DUE';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'UNPAID';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PAUSED';

ALTER TABLE "users" ADD COLUMN "stripeCustomerId" TEXT;

ALTER TABLE "subscription_plans"
ADD COLUMN "stripeProductId" TEXT,
ADD COLUMN "stripePriceId" TEXT,
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'usd',
ADD COLUMN "billingInterval" TEXT NOT NULL DEFAULT 'month';

ALTER TABLE "student_subscriptions"
ADD COLUMN "stripeCheckoutSessionId" TEXT,
ADD COLUMN "stripeSubscriptionId" TEXT,
ADD COLUMN "stripeStatus" TEXT,
ADD COLUMN "currentPeriodStart" TIMESTAMP(3),
ADD COLUMN "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canceledAt" TIMESTAMP(3);

CREATE TABLE "student_subscription_payments" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentSubscriptionId" TEXT,
    "planId" TEXT,
    "stripeInvoiceId" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "amountPaid" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_subscription_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stripe_webhook_events" (
    "id" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_stripeCustomerId_key" ON "users"("stripeCustomerId");
CREATE UNIQUE INDEX "subscription_plans_stripeProductId_key" ON "subscription_plans"("stripeProductId");
CREATE UNIQUE INDEX "subscription_plans_stripePriceId_key" ON "subscription_plans"("stripePriceId");
CREATE UNIQUE INDEX "student_subscriptions_stripeCheckoutSessionId_key" ON "student_subscriptions"("stripeCheckoutSessionId");
CREATE UNIQUE INDEX "student_subscriptions_stripeSubscriptionId_key" ON "student_subscriptions"("stripeSubscriptionId");
CREATE INDEX "student_subscriptions_stripeSubscriptionId_idx" ON "student_subscriptions"("stripeSubscriptionId");
CREATE UNIQUE INDEX "student_subscription_payments_stripeInvoiceId_key" ON "student_subscription_payments"("stripeInvoiceId");
CREATE INDEX "student_subscription_payments_studentId_idx" ON "student_subscription_payments"("studentId");
CREATE INDEX "student_subscription_payments_studentSubscriptionId_idx" ON "student_subscription_payments"("studentSubscriptionId");
CREATE INDEX "student_subscription_payments_planId_idx" ON "student_subscription_payments"("planId");
CREATE UNIQUE INDEX "stripe_webhook_events_stripeEventId_key" ON "stripe_webhook_events"("stripeEventId");

ALTER TABLE "student_subscription_payments" ADD CONSTRAINT "student_subscription_payments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_subscription_payments" ADD CONSTRAINT "student_subscription_payments_studentSubscriptionId_fkey" FOREIGN KEY ("studentSubscriptionId") REFERENCES "student_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "student_subscription_payments" ADD CONSTRAINT "student_subscription_payments_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
