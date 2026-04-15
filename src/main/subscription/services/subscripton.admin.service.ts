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
}
