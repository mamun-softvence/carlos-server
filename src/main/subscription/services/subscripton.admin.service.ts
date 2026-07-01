import { PrismaService } from '@/lib/prisma/prisma.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateSubscriptionPlanDto } from '../dto/create-subscription-plan.dto';
import { UpdateSubscriptionPlanDto } from '../dto/update-subscription-plan.dto';

@Injectable()
export class SubscriptionAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async createSubscription(dto: CreateSubscriptionPlanDto) {
    const plan = await this.prisma.client.subscriptionPlan.create({
      data: {
        name: dto.name,
        price: dto.price,
        durationDays: Number(dto.durationDays),
        creditsPerMonth: Number(dto.creditsPerMonth),
        features: dto.features as Prisma.InputJsonValue,
        isActive: dto.isActive ?? true,
        currency: dto.currency?.toLowerCase() ?? 'usd',
        billingInterval: dto.billingInterval ?? 'month',
      },
    });

    return {
      message: 'Subscription created successfully',
      data: plan,
    };
  }

  async getSubscriptions() {
    const plans = await this.prisma.client.subscriptionPlan.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      message: 'Subscriptions fetched successfully',
      data: plans,
    };
  }

  async getSubscriptionHistory() {
    const [subscriptions, payments] = await Promise.all([
      this.prisma.client.studentSubscription.findMany({
        include: {
          student: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          plan: true,
          payments: {
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.client.studentSubscriptionPayment.findMany({
        include: {
          student: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          plan: true,
          subscription: {
            select: {
              id: true,
              status: true,
              startDate: true,
              endDate: true,
              stripeSubscriptionId: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
    ]);

    return {
      message: 'Subscription history fetched successfully',
      data: {
        subscriptions,
        payments,
      },
    };
  }

  async updateSubscription(
    subscriptionId: string,
    dto: UpdateSubscriptionPlanDto,
  ) {
    const existingPlan = await this.prisma.client.subscriptionPlan.findUnique({
      where: { id: subscriptionId },
    });

    if (!existingPlan) {
      throw new NotFoundException('Subscription not found');
    }

    const shouldResetStripePrice = this.shouldResetStripePrice(
      existingPlan,
      dto,
    );

    const plan = await this.prisma.client.subscriptionPlan.update({
      where: { id: subscriptionId },
      data: {
        name: dto.name,
        price: dto.price,
        durationDays:
          dto.durationDays !== undefined ? Number(dto.durationDays) : undefined,
        creditsPerMonth:
          dto.creditsPerMonth !== undefined
            ? Number(dto.creditsPerMonth)
            : undefined,
        features:
          dto.features !== undefined
            ? (dto.features as Prisma.InputJsonValue)
            : undefined,
        isActive: dto.isActive,
        stripePriceId: shouldResetStripePrice ? null : undefined,
        currency: dto.currency?.toLowerCase(),
        billingInterval: dto.billingInterval,
      },
    });

    return {
      message: 'Subscription updated successfully',
      data: plan,
    };
  }

  async deleteSubscription(subscriptionId: string) {
    const plan = await this.prisma.client.subscriptionPlan.findUnique({
      where: { id: subscriptionId },
    });

    if (!plan) {
      throw new NotFoundException('Subscription not found');
    }

    await this.prisma.client.subscriptionPlan.delete({
      where: { id: subscriptionId },
    });

    return {
      message: 'Subscription deleted successfully',
    };
  }

  private shouldResetStripePrice(
    existingPlan: {
      price: Prisma.Decimal;
      currency: string;
      billingInterval: string;
    },
    dto: UpdateSubscriptionPlanDto,
  ) {
    const priceChanged =
      dto.price !== undefined &&
      !new Prisma.Decimal(dto.price).equals(existingPlan.price);
    const currencyChanged =
      dto.currency !== undefined &&
      dto.currency.toLowerCase() !== existingPlan.currency;
    const intervalChanged =
      dto.billingInterval !== undefined &&
      dto.billingInterval !== existingPlan.billingInterval;

    return priceChanged || currencyChanged || intervalChanged;
  }
}
