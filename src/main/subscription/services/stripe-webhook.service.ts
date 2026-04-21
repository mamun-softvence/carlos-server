import { PrismaService } from '@/lib/prisma/prisma.service';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { StripeService } from './stripe.service';

type StripeExpandable = string | { id: string } | null | undefined;
type StripeMetadata = Record<string, string> | null | undefined;
type StripeSubscriptionStatus =
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused';

type StripeEvent = {
  id: string;
  type: string;
  data: {
    object: unknown;
  };
};

type StripeCheckoutSession = {
  id: string;
  metadata?: StripeMetadata;
  subscription?: StripeExpandable;
  customer?: StripeExpandable;
  payment_status: string;
};

type StripeInvoice = {
  id: string;
  parent?: {
    subscription_details?: {
      metadata?: StripeMetadata;
      subscription: StripeExpandable;
    } | null;
  } | null;
  amount_paid: number;
  currency: string;
  status_transitions: {
    paid_at?: number | null;
  };
};

type StripeSubscription = {
  id: string;
  status: StripeSubscriptionStatus;
  metadata: Record<string, string>;
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
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
  ) {}

  async handleEvent(eventPayload: unknown) {
    const event = eventPayload as StripeEvent;

    const existingEvent =
      await this.prisma.client.stripeWebhookEvent.findUnique({
        where: {
          stripeEventId: event.id,
        },
      });

    if (existingEvent?.processedAt) {
      return { received: true };
    }

    await this.prisma.client.stripeWebhookEvent.upsert({
      where: {
        stripeEventId: event.id,
      },
      create: {
        stripeEventId: event.id,
        type: event.type,
        payload: event as unknown as Prisma.InputJsonValue,
      },
      update: {
        type: event.type,
        payload: event as unknown as Prisma.InputJsonValue,
        error: null,
      },
    });

    try {
      await this.processEvent(event);

      await this.prisma.client.stripeWebhookEvent.update({
        where: {
          stripeEventId: event.id,
        },
        data: {
          processedAt: new Date(),
          error: null,
        },
      });

      return { received: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Stripe webhook failed';

      await this.prisma.client.stripeWebhookEvent.update({
        where: {
          stripeEventId: event.id,
        },
        data: {
          error: message,
        },
      });

      throw error;
    }
  }

  private async processEvent(event: StripeEvent) {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(
          event.data.object as StripeCheckoutSession,
        );
        break;
      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object as StripeInvoice);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(
          event.data.object as StripeInvoice,
        );
        break;
      case 'customer.subscription.updated':
        await this.syncSubscription(event.data.object as StripeSubscription);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(
          event.data.object as StripeSubscription,
        );
        break;
      default:
        break;
    }
  }

  private async handleCheckoutSessionCompleted(session: StripeCheckoutSession) {
    const studentSubscriptionId = session.metadata?.studentSubscriptionId;
    const studentId = session.metadata?.studentId;
    const stripeSubscriptionId = this.getStripeId(session.subscription);
    const stripeCustomerId = this.getStripeId(session.customer);

    if (studentId && stripeCustomerId) {
      await this.prisma.client.user.updateMany({
        where: {
          id: studentId,
          stripeCustomerId: null,
        },
        data: {
          stripeCustomerId,
        },
      });
    }

    if (!studentSubscriptionId) {
      return;
    }

    await this.prisma.client.studentSubscription.updateMany({
      where: {
        id: studentSubscriptionId,
      },
      data: {
        stripeCheckoutSessionId: session.id,
        stripeSubscriptionId,
        stripeStatus: session.payment_status,
        status: SubscriptionStatus.INCOMPLETE,
      },
    });
  }

  private async handleInvoicePaid(invoice: StripeInvoice) {
    const stripeSubscriptionId = this.getInvoiceSubscriptionId(invoice);

    if (!stripeSubscriptionId) {
      return;
    }

    const stripeSubscription =
      (await this.stripeService.client.subscriptions.retrieve(
        stripeSubscriptionId,
      )) as unknown as StripeSubscription;

    const localSubscription = await this.findOrCreateLocalSubscription(
      stripeSubscription,
      invoice,
    );

    if (!localSubscription) {
      this.logger.warn(
        `Skipping invoice ${invoice.id}; no local subscription mapping found`,
      );
      return;
    }

    const period = this.getSubscriptionPeriod(stripeSubscription);
    const paidAt =
      this.fromUnix(invoice.status_transitions.paid_at) ?? new Date();

    try {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.studentSubscriptionPayment.create({
          data: {
            studentId: localSubscription.studentId,
            studentSubscriptionId: localSubscription.id,
            planId: localSubscription.planId,
            stripeInvoiceId: invoice.id,
            stripeCheckoutSessionId: localSubscription.stripeCheckoutSessionId,
            amountPaid: invoice.amount_paid,
            currency: invoice.currency,
            status: 'paid',
            paidAt,
          },
        });

        await tx.studentSubscription.update({
          where: {
            id: localSubscription.id,
          },
          data: {
            status: this.mapStripeSubscriptionStatus(stripeSubscription.status),
            stripeStatus: stripeSubscription.status,
            stripeSubscriptionId,
            startDate: period.currentPeriodStart,
            endDate: period.currentPeriodEnd,
            currentPeriodStart: period.currentPeriodStart,
            currentPeriodEnd: period.currentPeriodEnd,
            cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
            canceledAt: this.fromUnix(stripeSubscription.canceled_at),
          },
        });

        await tx.studentCreditBalance.upsert({
          where: {
            studentId: localSubscription.studentId,
          },
          update: {
            totalCredits: {
              increment: localSubscription.plan.creditsPerMonth,
            },
          },
          create: {
            studentId: localSubscription.studentId,
            totalCredits: localSubscription.plan.creditsPerMonth,
          },
        });
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        return;
      }

      throw error;
    }
  }

  private async handleInvoicePaymentFailed(invoice: StripeInvoice) {
    const stripeSubscriptionId = this.getInvoiceSubscriptionId(invoice);

    if (!stripeSubscriptionId) {
      return;
    }

    const stripeSubscription =
      (await this.stripeService.client.subscriptions.retrieve(
        stripeSubscriptionId,
      )) as unknown as StripeSubscription;

    const localSubscription = await this.findOrCreateLocalSubscription(
      stripeSubscription,
      invoice,
    );

    if (!localSubscription) {
      return;
    }

    await this.prisma.client.studentSubscription.update({
      where: {
        id: localSubscription.id,
      },
      data: {
        status: this.mapStripeSubscriptionStatus(stripeSubscription.status),
        stripeStatus: stripeSubscription.status,
        stripeSubscriptionId,
      },
    });
  }

  private async syncSubscription(subscription: StripeSubscription) {
    const period = this.getSubscriptionPeriod(subscription);

    await this.updateSubscriptionByStripeIdOrMetadata(subscription, {
      status: this.mapStripeSubscriptionStatus(subscription.status),
      stripeStatus: subscription.status,
      startDate: period.currentPeriodStart,
      endDate: period.currentPeriodEnd,
      currentPeriodStart: period.currentPeriodStart,
      currentPeriodEnd: period.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: this.fromUnix(subscription.canceled_at),
    });
  }

  private async handleSubscriptionDeleted(subscription: StripeSubscription) {
    const period = this.getSubscriptionPeriod(subscription);

    await this.updateSubscriptionByStripeIdOrMetadata(subscription, {
      status: SubscriptionStatus.CANCELLED,
      stripeStatus: subscription.status,
      endDate: period.currentPeriodEnd ?? new Date(),
      currentPeriodEnd: period.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: this.fromUnix(subscription.canceled_at) ?? new Date(),
    });
  }

  private async updateSubscriptionByStripeIdOrMetadata(
    subscription: StripeSubscription,
    data: Prisma.StudentSubscriptionUpdateManyMutationInput,
  ) {
    const result = await this.prisma.client.studentSubscription.updateMany({
      where: {
        stripeSubscriptionId: subscription.id,
      },
      data,
    });

    if (result.count > 0 || !subscription.metadata.studentSubscriptionId) {
      return;
    }

    await this.prisma.client.studentSubscription.updateMany({
      where: {
        id: subscription.metadata.studentSubscriptionId,
      },
      data: {
        ...data,
        stripeSubscriptionId: subscription.id,
      },
    });
  }

  private async findOrCreateLocalSubscription(
    stripeSubscription: StripeSubscription,
    invoice: StripeInvoice,
  ) {
    const existing = await this.prisma.client.studentSubscription.findUnique({
      where: {
        stripeSubscriptionId: stripeSubscription.id,
      },
      include: {
        plan: true,
      },
    });

    if (existing) {
      return existing;
    }

    const metadata =
      invoice.parent?.subscription_details?.metadata ??
      stripeSubscription.metadata;
    const studentSubscriptionId = metadata?.studentSubscriptionId;

    if (studentSubscriptionId) {
      const existingById =
        await this.prisma.client.studentSubscription.findUnique({
          where: {
            id: studentSubscriptionId,
          },
          include: {
            plan: true,
          },
        });

      if (existingById) {
        return this.prisma.client.studentSubscription.update({
          where: {
            id: existingById.id,
          },
          data: {
            stripeSubscriptionId: stripeSubscription.id,
            stripeStatus: stripeSubscription.status,
          },
          include: {
            plan: true,
          },
        });
      }
    }

    const studentId = metadata?.studentId;
    const planId = metadata?.planId;

    if (!studentId || !planId) {
      return null;
    }

    return this.prisma.client.studentSubscription.create({
      data: {
        studentId,
        planId,
        status: SubscriptionStatus.PENDING,
        autoRenew: true,
        stripeSubscriptionId: stripeSubscription.id,
        stripeStatus: stripeSubscription.status,
      },
      include: {
        plan: true,
      },
    });
  }

  private getInvoiceSubscriptionId(invoice: StripeInvoice) {
    return this.getStripeId(invoice.parent?.subscription_details?.subscription);
  }

  private getStripeId(value: StripeExpandable) {
    if (!value) {
      return undefined;
    }

    return typeof value === 'string' ? value : value.id;
  }

  private getSubscriptionPeriod(subscription: StripeSubscription) {
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

  private isUniqueConstraintError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
