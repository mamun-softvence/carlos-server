import { PrismaService } from '@/lib/prisma/prisma.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, UserRole, UserStatus } from '@prisma/client';
import { AdminAnalyticsQueryDto } from '../dto/admin-analytics-query.dto';
import { AdminUserQueryDto } from '../dto/admin-user-query.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly monthLabels = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ] as const;

  private readonly studentListSelect = {
    id: true,
    name: true,
    email: true,
    role: true,
    status: true,
    avatarUrl: true,
    avatarPublicId: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  private readonly tutorListSelect = {
    id: true,
    name: true,
    email: true,
    role: true,
    status: true,
    avatarUrl: true,
    avatarPublicId: true,
    tutorRoles: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  private getMonthRange(baseDate = new Date(), monthOffset = 0) {
    const start = new Date(
      Date.UTC(
        baseDate.getUTCFullYear(),
        baseDate.getUTCMonth() + monthOffset,
        1,
      ),
    );
    const end = new Date(
      Date.UTC(
        baseDate.getUTCFullYear(),
        baseDate.getUTCMonth() + monthOffset + 1,
        1,
      ),
    );

    return { start, end };
  }

  private getTargetYear(year?: number) {
    return year ?? new Date().getUTCFullYear();
  }

  private getYearRange(year: number) {
    return {
      start: new Date(Date.UTC(year, 0, 1)),
      end: new Date(Date.UTC(year + 1, 0, 1)),
    };
  }

  private getPercentageChange(currentValue: number, previousValue: number) {
    if (previousValue === 0) {
      return currentValue === 0 ? 0 : 100;
    }

    return Number(
      (((currentValue - previousValue) / previousValue) * 100).toFixed(2),
    );
  }

  private toMajorUnit(amountMinor: number) {
    return Number((amountMinor / 100).toFixed(2));
  }

  private createEmptyMonthlySeries() {
    return Array.from({ length: 12 }, () => 0);
  }

  private toMonthIndex(date: Date) {
    return date.getUTCMonth();
  }

  async getOverview() {
    const now = new Date();
    const currentMonthRange = this.getMonthRange(now);
    const previousMonthRange = this.getMonthRange(now, -1);

    const [
      activeStudents,
      currentMonthActiveStudents,
      previousMonthActiveStudents,
      activeTutors,
      currentMonthActiveTutors,
      previousMonthActiveTutors,
      totalBookings,
      currentMonthTotalBookings,
      previousMonthTotalBookings,
      totalRevenueAggregate,
      currentMonthRevenueAggregate,
      previousMonthRevenueAggregate,
    ] = await Promise.all([
      this.prisma.client.user.count({
        where: {
          role: UserRole.STUDENT,
          status: UserStatus.ACTIVE,
        },
      }),
      this.prisma.client.user.count({
        where: {
          role: UserRole.STUDENT,
          status: UserStatus.ACTIVE,
          createdAt: {
            gte: currentMonthRange.start,
            lt: currentMonthRange.end,
          },
        },
      }),
      this.prisma.client.user.count({
        where: {
          role: UserRole.STUDENT,
          status: UserStatus.ACTIVE,
          createdAt: {
            gte: previousMonthRange.start,
            lt: previousMonthRange.end,
          },
        },
      }),
      this.prisma.client.user.count({
        where: {
          role: UserRole.TUTOR,
          status: UserStatus.ACTIVE,
        },
      }),
      this.prisma.client.user.count({
        where: {
          role: UserRole.TUTOR,
          status: UserStatus.ACTIVE,
          createdAt: {
            gte: currentMonthRange.start,
            lt: currentMonthRange.end,
          },
        },
      }),
      this.prisma.client.user.count({
        where: {
          role: UserRole.TUTOR,
          status: UserStatus.ACTIVE,
          createdAt: {
            gte: previousMonthRange.start,
            lt: previousMonthRange.end,
          },
        },
      }),
      this.prisma.client.booking.count(),
      this.prisma.client.booking.count({
        where: {
          createdAt: {
            gte: currentMonthRange.start,
            lt: currentMonthRange.end,
          },
        },
      }),
      this.prisma.client.booking.count({
        where: {
          createdAt: {
            gte: previousMonthRange.start,
            lt: previousMonthRange.end,
          },
        },
      }),
      this.prisma.client.studentSubscriptionPayment.aggregate({
        where: {
          status: 'paid',
        },
        _sum: {
          amountPaid: true,
        },
      }),
      this.prisma.client.studentSubscriptionPayment.aggregate({
        where: {
          status: 'paid',
          paidAt: {
            gte: currentMonthRange.start,
            lt: currentMonthRange.end,
          },
        },
        _sum: {
          amountPaid: true,
        },
      }),
      this.prisma.client.studentSubscriptionPayment.aggregate({
        where: {
          status: 'paid',
          paidAt: {
            gte: previousMonthRange.start,
            lt: previousMonthRange.end,
          },
        },
        _sum: {
          amountPaid: true,
        },
      }),
    ]);
    const totalRevenueMinor = totalRevenueAggregate._sum.amountPaid ?? 0;
    const currentMonthTotalRevenueMinor =
      currentMonthRevenueAggregate._sum.amountPaid ?? 0;
    const previousMonthTotalRevenueMinor =
      previousMonthRevenueAggregate._sum.amountPaid ?? 0;

    return {
      message: 'Admin overview fetched successfully',
      data: {
        activeStudents,
        currentMonthActiveStudentsPercentage: this.getPercentageChange(
          currentMonthActiveStudents,
          previousMonthActiveStudents,
        ),
        activeTutors,
        currentMonthActiveTutorsPercentage: this.getPercentageChange(
          currentMonthActiveTutors,
          previousMonthActiveTutors,
        ),
        totalBookings,
        currentMonthTotalBookingsPercentage: this.getPercentageChange(
          currentMonthTotalBookings,
          previousMonthTotalBookings,
        ),
        totalRevenue: this.toMajorUnit(totalRevenueMinor),
        currentMonthTotalRevenuePercentage: this.getPercentageChange(
          currentMonthTotalRevenueMinor,
          previousMonthTotalRevenueMinor,
        ),
      },
    };
  }

  async getRevenueGrowth(query: AdminAnalyticsQueryDto) {
    const year = this.getTargetYear(query.year);
    const currentYearRange = this.getYearRange(year);
    const previousYearRange = this.getYearRange(year - 1);

    const [currentYearPayments, previousYearPayments] = await Promise.all([
      this.prisma.client.studentSubscriptionPayment.findMany({
        where: {
          status: 'paid',
          paidAt: {
            gte: currentYearRange.start,
            lt: currentYearRange.end,
          },
        },
        select: {
          amountPaid: true,
          paidAt: true,
        },
        orderBy: {
          paidAt: 'asc',
        },
      }),
      this.prisma.client.studentSubscriptionPayment.findMany({
        where: {
          status: 'paid',
          paidAt: {
            gte: previousYearRange.start,
            lt: previousYearRange.end,
          },
        },
        select: {
          amountPaid: true,
          paidAt: true,
        },
      }),
    ]);

    const monthlyRevenueMinor = this.createEmptyMonthlySeries();

    for (const payment of currentYearPayments) {
      if (!payment.paidAt) {
        continue;
      }

      const monthIndex = this.toMonthIndex(payment.paidAt);
      monthlyRevenueMinor[monthIndex] += payment.amountPaid;
    }

    const totalRevenueMinor = currentYearPayments.reduce(
      (sum, payment) => sum + payment.amountPaid,
      0,
    );
    const previousYearTotalRevenueMinor = previousYearPayments.reduce(
      (sum, payment) => sum + payment.amountPaid,
      0,
    );

    const series = monthlyRevenueMinor.map((amountMinor) =>
      this.toMajorUnit(amountMinor),
    );
    const labels = [...this.monthLabels];
    const chart = labels.map((month, index) => ({
      month,
      revenue: series[index],
    }));

    return {
      message: 'Admin revenue growth fetched successfully',
      data: {
        year,
        totalRevenue: this.toMajorUnit(totalRevenueMinor),
        previousYearTotalRevenue: this.toMajorUnit(
          previousYearTotalRevenueMinor,
        ),
        yearlyGrowthPercentage: this.getPercentageChange(
          totalRevenueMinor,
          previousYearTotalRevenueMinor,
        ),
        labels,
        series,
        chart,
      },
    };
  }

  async getClassDistribution(query: AdminAnalyticsQueryDto) {
    const year = this.getTargetYear(query.year);
    const yearRange = this.getYearRange(year);

    const bookings = await this.prisma.client.booking.findMany({
      where: {
        status: {
          in: [BookingStatus.SCHEDULED, BookingStatus.COMPLETED],
        },
        scheduledAt: {
          gte: yearRange.start,
          lt: yearRange.end,
        },
      },
      select: {
        scheduledAt: true,
        participants: {
          select: {
            studentId: true,
          },
        },
      },
      orderBy: {
        scheduledAt: 'asc',
      },
    });

    const groupClasses = this.createEmptyMonthlySeries();
    const privateSessions = this.createEmptyMonthlySeries();

    for (const booking of bookings) {
      if (!booking.scheduledAt) {
        continue;
      }

      const monthIndex = this.toMonthIndex(booking.scheduledAt);
      const participantCount = booking.participants.length;

      if (participantCount > 1) {
        groupClasses[monthIndex] += 1;
      } else {
        privateSessions[monthIndex] += 1;
      }
    }

    const labels = [...this.monthLabels];
    const chart = labels.map((month, index) => ({
      month,
      groupClasses: groupClasses[index],
      privateSessions: privateSessions[index],
    }));

    return {
      message: 'Admin class distribution fetched successfully',
      data: {
        year,
        labels,
        groupClasses,
        privateSessions,
        totals: {
          groupClasses: groupClasses.reduce((sum, count) => sum + count, 0),
          privateSessions: privateSessions.reduce(
            (sum, count) => sum + count,
            0,
          ),
        },
        chart,
      },
    };
  }

  async getAllStudents(query: AdminUserQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: any = {
      role: UserRole.STUDENT,
    };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [students, total] = await Promise.all([
      this.prisma.client.user.findMany({
        where,
        select: this.studentListSelect,
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.client.user.count({ where }),
    ]);

    return {
      message: 'Students fetched successfully',
      data: students,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAllTutors(query: AdminUserQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: any = {
      role: UserRole.TUTOR,
    };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [tutors, total] = await Promise.all([
      this.prisma.client.user.findMany({
        where,
        select: this.tutorListSelect,
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.client.user.count({ where }),
    ]);

    return {
      message: 'Tutors fetched successfully',
      data: tutors,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateUserStatus(userId: string, status: UserStatus) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException(
        'Admin accounts cannot be updated from this route',
      );
    }

    if (![UserRole.STUDENT, UserRole.TUTOR].includes(user.role)) {
      throw new BadRequestException(
        'Only student and tutor accounts can be updated from this route',
      );
    }

    const isTutor = user.role === UserRole.TUTOR;

    const updatedUser =
      user.status === status
        ? user
        : await this.prisma.client.user.update({
            where: { id: userId },
            data: {
              status,
              refreshToken: status === UserStatus.ACTIVE ? undefined : null,
            },
            select: isTutor ? this.tutorListSelect : this.studentListSelect,
          });

    return {
      message: `${user.role.toLowerCase()} status updated to ${status.toLowerCase()} successfully`,
      data: updatedUser,
    };
  }
}
