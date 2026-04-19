import { PrismaService } from '@/lib/prisma/prisma.service';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SubscriptionStatus, UserRole } from '@prisma/client';

@Injectable()
export class SubscriptionStudentService {
  constructor(private readonly prisma: PrismaService) {}

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

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + plan.durationDays);

    const { subscription, creditBalance } =
      await this.prisma.client.$transaction(async (tx) => {
        const subscription = await tx.studentSubscription.create({
          data: {
            studentId,
            planId: plan.id,
            status: SubscriptionStatus.ACTIVE,
            startDate,
            endDate,
          },
          include: {
            plan: true,
          },
        });

        const creditBalance = await tx.studentCreditBalance.upsert({
          where: {
            studentId,
          },
          update: {
            totalCredits: {
              increment: plan.creditsPerMonth,
            },
          },
          create: {
            studentId,
            totalCredits: plan.creditsPerMonth,
          },
        });

        return {
          subscription,
          creditBalance,
        };
      });

    return {
      message: 'Subscription activated successfully',
      data: {
        subscription,
        creditBalance,
        creditsAdded: plan.creditsPerMonth,
      },
    };
  }
}
