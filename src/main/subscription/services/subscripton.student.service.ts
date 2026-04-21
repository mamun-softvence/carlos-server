import { ENVEnum } from '@/common/enum/env.enum';
import { PrismaService } from '@/lib/prisma/prisma.service';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, SubscriptionStatus, UserRole } from '@prisma/client';
import { StripeService } from './stripe.service';

type BillingInterval = 'day' | 'week' | 'month' | 'year';
type StripeExpandable = string | { id: string } | null | undefined;
type StripeSubscriptionStatus =
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused';
type StripeCheckoutSessionDetails = {
  id: string;
  payment_status: string;
  status: string | null;
  subscription?: StripeExpandable;
};
type StripeInvoiceDetails = {
  id: string;
  amount_paid: number;
  currency: string;
  status: string | null;
  status_transitions?: {
    paid_at?: number | null;
  };
};
type StripeSubscriptionDetails = {
  id: string;
  status: StripeSubscriptionStatus;
  latest_invoice?: StripeExpandable;
  cancel_at_period_end: boolean;
  canceled_at: number | null;
  start_date: number;
  items: {
    data: Array<{
      current_period_start: number;
      current_period_end: number;
    }>;
  };
};

@Injectable()
export class SubscriptionStudentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
  ) {}

  async getCurrentSubscription(studentId: string) {
    const student = await this.prisma.client.user.findFirst({
      where: {
        id: studentId,
        role: UserRole.STUDENT,
      },
      select: {
        id: true,
      },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const now = new Date();

    const [currentSubscription, activeSubscriptions, expiredSubscriptions] =
      await Promise.all([
        this.prisma.client.studentSubscription.findFirst({
          where: {
            studentId,
            status: SubscriptionStatus.ACTIVE,
            OR: [{ endDate: null }, { endDate: { gt: now } }],
          },
          include: {
            plan: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        }),
        this.prisma.client.studentSubscription.findMany({
          where: {
            studentId,
            status: SubscriptionStatus.ACTIVE,
            OR: [{ endDate: null }, { endDate: { gt: now } }],
          },
          include: {
            plan: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        }),
        this.prisma.client.studentSubscription.findMany({
          where: {
            studentId,
            OR: [
              { status: SubscriptionStatus.EXPIRED },
              { endDate: { lt: now } },
            ],
          },
          include: {
            plan: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        }),
      ]);

    return {
      message: 'Student subscriptions fetched successfully',
      data: {
        currentSubscription,
        activeSubscriptions,
        expiredSubscriptions,
      },
    };
  }

  async takeSubscription(studentId: string, planId: string) {
    const student = await this.prisma.client.user.findFirst({
      where: {
        id: studentId,
        role: UserRole.STUDENT,
      },
      select: {
        id: true,
        name: true,
        email: true,
        stripeCustomerId: true,
      },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const plan = await this.prisma.client.subscriptionPlan.findFirst({
      where: {
        id: planId,
        isActive: true,
      },
    });

    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }

    const activeSubscription =
      await this.prisma.client.studentSubscription.findFirst({
        where: {
          studentId,
          status: SubscriptionStatus.ACTIVE,
          OR: [{ endDate: null }, { endDate: { gt: new Date() } }],
        },
        include: {
          plan: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

    if (activeSubscription) {
      throw new ConflictException('Student already has an active subscription');
    }

    const stripeCustomerId = await this.getOrCreateStripeCustomer(student);
    const stripePriceId = await this.getOrCreateStripePrice(plan);

    const subscription = await this.prisma.client.studentSubscription.create({
      data: {
        studentId,
        planId: plan.id,
        status: SubscriptionStatus.PENDING,
        autoRenew: true,
      },
      include: {
        plan: true,
      },
    });

    const metadata = {
      studentId,
      planId: plan.id,
      studentSubscriptionId: subscription.id,
    };

    const checkoutSession =
      await this.stripeService.client.checkout.sessions.create({
        mode: 'subscription',
        customer: stripeCustomerId,
        client_reference_id: subscription.id,
        line_items: [
          {
            price: stripePriceId,
            quantity: 1,
          },
        ],
        metadata,
        subscription_data: {
          metadata,
        },
        success_url: `${this.getFrontendUrl()}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${this.getFrontendUrl()}/subscription/cancel`,
      });

    if (!checkoutSession.url) {
      throw new ConflictException(
        'Stripe checkout session URL was not created',
      );
    }

    const updatedSubscription =
      await this.prisma.client.studentSubscription.update({
        where: {
          id: subscription.id,
        },
        data: {
          stripeCheckoutSessionId: checkoutSession.id,
        },
        include: {
          plan: true,
        },
      });

    return {
      message: 'Stripe checkout session created successfully',
      data: {
        checkoutUrl: checkoutSession.url,
        checkoutSessionId: checkoutSession.id,
        subscription: updatedSubscription,
      },
    };
  }

  async confirmCheckoutSession(studentId: string, sessionId: string) {
    const localSubscription =
      await this.prisma.client.studentSubscription.findFirst({
        where: {
          studentId,
          stripeCheckoutSessionId: sessionId,
        },
        include: {
          plan: true,
        },
      });

    if (!localSubscription) {
      throw new NotFoundException('Checkout session not found');
    }

    const checkoutSession =
      (await this.stripeService.client.checkout.sessions.retrieve(sessionId, {
        expand: ['subscription'],
      })) as unknown as StripeCheckoutSessionDetails;

    const stripeSubscriptionId = this.getStripeId(checkoutSession.subscription);

    if (!stripeSubscriptionId || checkoutSession.payment_status !== 'paid') {
      return {
        message: 'Checkout session is not paid yet',
        data: {
          paymentStatus: checkoutSession.payment_status,
          checkoutStatus: checkoutSession.status,
          subscription: localSubscription,
        },
      };
    }

    const stripeSubscription =
      (await this.stripeService.client.subscriptions.retrieve(
        stripeSubscriptionId,
        {
          expand: ['latest_invoice'],
        },
      )) as unknown as StripeSubscriptionDetails;

    const invoice = await this.getLatestInvoice(stripeSubscription);
    const period = this.getSubscriptionPeriod(stripeSubscription);
    const paidAt =
      this.fromUnix(invoice?.status_transitions?.paid_at) ?? new Date();

    const subscription = await this.prisma.client.$transaction(async (tx) => {
      let shouldAddCredits = false;

      if (invoice?.id) {
        const existingPayment = await tx.studentSubscriptionPayment.findUnique({
          where: {
            stripeInvoiceId: invoice.id,
          },
        });

        if (!existingPayment) {
          shouldAddCredits = true;

          await tx.studentSubscriptionPayment.create({
            data: {
              studentId,
              studentSubscriptionId: localSubscription.id,
              planId: localSubscription.planId,
              stripeInvoiceId: invoice.id,
              stripeCheckoutSessionId: sessionId,
              amountPaid: invoice.amount_paid,
              currency: invoice.currency,
              status: invoice.status ?? 'paid',
              paidAt,
            },
          });
        }
      }

      const updatedSubscription = await tx.studentSubscription.update({
        where: {
          id: localSubscription.id,
        },
        data: {
          status: this.mapStripeSubscriptionStatus(stripeSubscription.status),
          stripeCheckoutSessionId: sessionId,
          stripeSubscriptionId,
          stripeStatus: stripeSubscription.status,
          startDate: period.currentPeriodStart,
          endDate: period.currentPeriodEnd,
          currentPeriodStart: period.currentPeriodStart,
          currentPeriodEnd: period.currentPeriodEnd,
          cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
          canceledAt: this.fromUnix(stripeSubscription.canceled_at),
        },
        include: {
          plan: true,
        },
      });

      if (shouldAddCredits) {
        await tx.studentCreditBalance.upsert({
          where: {
            studentId,
          },
          update: {
            totalCredits: {
              increment: localSubscription.plan.creditsPerMonth,
            },
          },
          create: {
            studentId,
            totalCredits: localSubscription.plan.creditsPerMonth,
          },
        });
      }

      return updatedSubscription;
    });

    return {
      message: 'Checkout session confirmed successfully',
      data: {
        subscription,
      },
    };
  }

  private async getOrCreateStripeCustomer(student: {
    id: string;
    name: string | null;
    email: string;
    stripeCustomerId: string | null;
  }) {
    if (student.stripeCustomerId) {
      return student.stripeCustomerId;
    }

    const customer = await this.stripeService.client.customers.create({
      email: student.email,
      name: student.name ?? undefined,
      metadata: {
        studentId: student.id,
      },
    });

    await this.prisma.client.user.update({
      where: {
        id: student.id,
      },
      data: {
        stripeCustomerId: customer.id,
      },
    });

    return customer.id;
  }

  private async getOrCreateStripePrice(plan: {
    id: string;
    name: string;
    price: Prisma.Decimal;
    stripeProductId: string | null;
    stripePriceId: string | null;
    currency: string;
    billingInterval: string;
  }) {
    if (plan.stripePriceId) {
      return plan.stripePriceId;
    }

    const stripeProductId =
      plan.stripeProductId ??
      (
        await this.stripeService.client.products.create({
          name: plan.name,
          metadata: {
            planId: plan.id,
          },
        })
      ).id;

    const price = await this.stripeService.client.prices.create({
      product: stripeProductId,
      currency: plan.currency.toLowerCase(),
      unit_amount: this.toStripeAmount(plan.price.toString()),
      recurring: {
        interval: this.getBillingInterval(plan.billingInterval),
      },
      metadata: {
        planId: plan.id,
      },
    });

    await this.prisma.client.subscriptionPlan.update({
      where: {
        id: plan.id,
      },
      data: {
        stripeProductId,
        stripePriceId: price.id,
      },
    });

    return price.id;
  }

  private getBillingInterval(interval: string): BillingInterval {
    if (['day', 'week', 'month', 'year'].includes(interval)) {
      return interval as BillingInterval;
    }

    return 'month';
  }

  private toStripeAmount(price: string) {
    const [wholePart, decimalPart = ''] = price.split('.');
    const whole = Number(wholePart);
    const cents = Number(decimalPart.padEnd(2, '0').slice(0, 2));

    return whole * 100 + cents;
  }

  private async getLatestInvoice(subscription: StripeSubscriptionDetails) {
    const invoiceId = this.getStripeId(subscription.latest_invoice);

    if (!invoiceId) {
      return null;
    }

    if (typeof subscription.latest_invoice === 'object') {
      return subscription.latest_invoice as StripeInvoiceDetails;
    }

    return (await this.stripeService.client.invoices.retrieve(
      invoiceId,
    )) as unknown as StripeInvoiceDetails;
  }

  private getStripeId(value: StripeExpandable) {
    if (!value) {
      return undefined;
    }

    return typeof value === 'string' ? value : value.id;
  }

  private getSubscriptionPeriod(subscription: StripeSubscriptionDetails) {
    const item = subscription.items.data[0];

    return {
      currentPeriodStart: this.fromUnix(
        item?.current_period_start ?? subscription.start_date,
      ),
      currentPeriodEnd: this.fromUnix(item?.current_period_end),
    };
  }

  private fromUnix(timestamp?: number | null) {
    return timestamp ? new Date(timestamp * 1000) : null;
  }

  private mapStripeSubscriptionStatus(status: StripeSubscriptionStatus) {
    switch (status) {
      case 'active':
      case 'trialing':
        return SubscriptionStatus.ACTIVE;
      case 'incomplete':
        return SubscriptionStatus.INCOMPLETE;
      case 'past_due':
        return SubscriptionStatus.PAST_DUE;
      case 'unpaid':
        return SubscriptionStatus.UNPAID;
      case 'paused':
        return SubscriptionStatus.PAUSED;
      case 'canceled':
        return SubscriptionStatus.CANCELLED;
      case 'incomplete_expired':
        return SubscriptionStatus.FAILED;
      default:
        return SubscriptionStatus.PENDING;
    }
  }

  private getFrontendUrl() {
    return (
      this.configService.get<string>(ENVEnum.FRONTEND_URL) ??
      'http://localhost:3000'
    ).replace(/\/$/, '');
  }
}
