import { PrismaService } from '@/lib/prisma/prisma.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, Prisma, UserRole } from '@prisma/client';
import { AdminStudentLogQueryDto } from '../dto/admin-student-log-query.dto';
import { UpdateStudentMarkDto } from '../dto/update-student-mark.dto';

@Injectable()
export class LogService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly maxScorePerField = 50;
  private readonly maxTotalPoints = this.maxScorePerField * 5;

  private readonly userSummarySelect = {
    id: true,
    name: true,
    email: true,
    avatarUrl: true,
  } as const;

  private readonly adminStudentProfileSelect = {
    id: true,
    name: true,
    email: true,
    phoneNumber: true,
    timeZone: true,
    googleCalendarEnabled: true,
    role: true,
    avatarUrl: true,
    avatarPublicId: true,
    isEmailVerified: true,
    status: true,
    acceptedTerms: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.UserSelect;

  private readonly adminBookingInclude = {
    tutor: {
      select: this.userSummarySelect,
    },
    assignedByAdmin: {
      select: {
        id: true,
        name: true,
        email: true,
      },
    },
    participants: {
      select: {
        student: {
          select: this.userSummarySelect,
        },
      },
    },
  } satisfies Prisma.BookingInclude;

  private readonly paymentInclude = {
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
  } satisfies Prisma.StudentSubscriptionPaymentInclude;

  private readonly studentLogScoreSelect = {
    id: true,
    studentId: true,
    tutorId: true,
    territoryExpansion: true,
    totalPoints: true,
    input: true,
    output: true,
    architecture: true,
    lexicon: true,
    dynamics: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.StudentLogCompetencySelect;

  private formatStudentLog<
    T extends {
      territoryExpansion: Prisma.Decimal;
      totalPoints: number;
      input: number;
      output: number;
      architecture: number;
      lexicon: number;
      dynamics: number;
    },
  >(studentLog: T) {
    return {
      ...studentLog,
      territoryExpansion: this.calculateTerritoryExpansion(
        studentLog.totalPoints,
      ),
      inputPercentage: this.calculatePercentage(studentLog.input),
      outputPercentage: this.calculatePercentage(studentLog.output),
      architecturePercentage: this.calculatePercentage(studentLog.architecture),
      lexiconPercentage: this.calculatePercentage(studentLog.lexicon),
      dynamicsPercentage: this.calculatePercentage(studentLog.dynamics),
    };
  }

  private calculatePercentage(value: number) {
    return Number(((value / this.maxScorePerField) * 100).toFixed(2));
  }

  private calculateTerritoryExpansion(totalPoints: number) {
    return Number(((totalPoints / this.maxTotalPoints) * 100).toFixed(2));
  }

  private capScore(value: number) {
    return Math.min(value, this.maxScorePerField);
  }

  private getPagination(query: AdminStudentLogQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    return {
      page,
      limit,
      skip: (page - 1) * limit,
      take: limit,
    };
  }

  private getPaginatedResponse<T>(
    message: string,
    data: T[],
    pagination: { page: number; limit: number },
    total: number,
  ) {
    return {
      message,
      data,
      meta: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPage: Math.ceil(total / pagination.limit),
      },
    };
  }

  private getStudentBookingWhere(studentId: string): Prisma.BookingWhereInput {
    return {
      OR: [
        {
          studentId,
        },
        {
          participants: {
            some: {
              studentId,
            },
          },
        },
      ],
    };
  }

  private async getStudentOrThrow(studentId: string) {
    const student = await this.prisma.client.user.findFirst({
      where: {
        id: studentId,
        role: UserRole.STUDENT,
      },
      select: this.adminStudentProfileSelect,
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    return student;
  }

  private formatSubscriptionPayment<
    T extends {
      plan: ({ price: Prisma.Decimal } & Record<string, unknown>) | null;
    },
  >(payment: T) {
    return {
      ...payment,
      plan: payment.plan
        ? {
            ...payment.plan,
            price: Number(payment.plan.price),
          }
        : null,
    };
  }

  async getTutorStudentLog(studentId: string, tutorId: string) {
    const studentLog = await this.prisma.client.studentLogCompetency.findUnique(
      {
        where: {
          studentId_tutorId: {
            studentId,
            tutorId,
          },
        },
        select: this.studentLogScoreSelect,
      },
    );

    return {
      message: 'Student log fetched successfully',
      data: studentLog ? this.formatStudentLog(studentLog) : null,
    };
  }

  async getStudentLogsByStudent(studentId: string) {
    await this.getStudentOrThrow(studentId);

    const studentLogs = await this.prisma.client.studentLogCompetency.findMany({
      where: {
        studentId,
      },
      select: this.studentLogScoreSelect,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      message: 'Student logs fetched successfully',
      data: studentLogs.map((studentLog) => this.formatStudentLog(studentLog)),
    };
  }

  async upsertStudentMark(
    studentId: string,
    tutorId: string,
    dto: UpdateStudentMarkDto,
  ) {
    const studentLog = await this.prisma.client.$transaction(async (tx) => {
      const existingLog = await tx.studentLogCompetency.findUnique({
        where: {
          studentId_tutorId: {
            studentId,
            tutorId,
          },
        },
        select: {
          id: true,
          input: true,
          output: true,
          architecture: true,
          lexicon: true,
          dynamics: true,
        },
      });

      const nextInput = this.capScore((existingLog?.input ?? 0) + dto.input);
      const nextOutput = this.capScore((existingLog?.output ?? 0) + dto.output);
      const nextArchitecture = this.capScore(
        (existingLog?.architecture ?? 0) + dto.architecture,
      );
      const nextLexicon = this.capScore(
        (existingLog?.lexicon ?? 0) + dto.lexicon,
      );
      const nextDynamics = this.capScore(
        (existingLog?.dynamics ?? 0) + dto.dynamics,
      );
      const totalPoints =
        nextInput + nextOutput + nextArchitecture + nextLexicon + nextDynamics;
      const territoryExpansion = this.calculateTerritoryExpansion(totalPoints);

      if (!existingLog) {
        return tx.studentLogCompetency.create({
          data: {
            studentId,
            tutorId,
            input: nextInput,
            output: nextOutput,
            architecture: nextArchitecture,
            lexicon: nextLexicon,
            dynamics: nextDynamics,
            totalPoints,
            territoryExpansion,
          },
          select: this.studentLogScoreSelect,
        });
      }

      return tx.studentLogCompetency.update({
        where: {
          id: existingLog.id,
        },
        data: {
          input: nextInput,
          output: nextOutput,
          architecture: nextArchitecture,
          lexicon: nextLexicon,
          dynamics: nextDynamics,
          totalPoints,
          territoryExpansion,
        },
        select: this.studentLogScoreSelect,
      });
    });

    return {
      message: 'Student mark saved successfully',
      data: this.formatStudentLog(studentLog),
    };
  }

  async getAdminStudentProfile(studentId: string) {
    const student = await this.getStudentOrThrow(studentId);

    const [creditBalance, subscriptions] = await Promise.all([
      this.prisma.client.studentCreditBalance.findUnique({
        where: {
          studentId,
        },
        select: {
          totalCredits: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.client.studentSubscription.findMany({
        where: {
          studentId,
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
      message: 'Student profile fetched successfully',
      data: {
        profile: student,
        creditBalance: {
          totalCredits: creditBalance?.totalCredits ?? 0,
          createdAt: creditBalance?.createdAt ?? null,
          updatedAt: creditBalance?.updatedAt ?? null,
        },
        subscriptions: subscriptions.map((subscription) => ({
          ...subscription,
          plan: {
            ...subscription.plan,
            price: Number(subscription.plan.price),
          },
        })),
      },
    };
  }

  async getAdminStudentOverview(studentId: string) {
    const student = await this.getStudentOrThrow(studentId);
    const bookingWhere = this.getStudentBookingWhere(studentId);
    const now = new Date();

    const [
      creditBalance,
      creditSpentAggregate,
      totalBookings,
      bookingStatusGroups,
      upcomingClassesCount,
      upcomingClasses,
      assignedTutorRows,
      studentLogs,
      transactionCount,
      paidAmountAggregate,
    ] = await Promise.all([
      this.prisma.client.studentCreditBalance.findUnique({
        where: {
          studentId,
        },
        select: {
          totalCredits: true,
        },
      }),
      this.prisma.client.booking.aggregate({
        where: {
          studentId,
          creditDeductedAt: {
            not: null,
          },
          creditRefundedAt: null,
        },
        _sum: {
          creditCost: true,
        },
      }),
      this.prisma.client.booking.count({
        where: bookingWhere,
      }),
      this.prisma.client.booking.groupBy({
        by: ['status'],
        where: bookingWhere,
        _count: {
          _all: true,
        },
      }),
      this.prisma.client.booking.count({
        where: {
          ...bookingWhere,
          status: BookingStatus.SCHEDULED,
          scheduledAt: {
            gte: now,
          },
        },
      }),
      this.prisma.client.booking.findMany({
        where: {
          ...bookingWhere,
          status: BookingStatus.SCHEDULED,
          scheduledAt: {
            gte: now,
          },
        },
        include: this.adminBookingInclude,
        orderBy: {
          scheduledAt: 'asc',
        },
        take: 5,
      }),
      this.prisma.client.booking.findMany({
        where: {
          ...bookingWhere,
          tutorId: {
            not: null,
          },
        },
        distinct: ['tutorId'],
        select: {
          tutorId: true,
        },
      }),
      this.prisma.client.studentLogCompetency.findMany({
        where: {
          studentId,
        },
        select: this.studentLogScoreSelect,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.client.studentSubscriptionPayment.count({
        where: {
          studentId,
        },
      }),
      this.prisma.client.studentSubscriptionPayment.aggregate({
        where: {
          studentId,
        },
        _sum: {
          amountPaid: true,
        },
      }),
    ]);

    const statusCounts = Object.values(BookingStatus).reduce(
      (acc, status) => ({
        ...acc,
        [status]: 0,
      }),
      {} as Record<BookingStatus, number>,
    );

    for (const group of bookingStatusGroups) {
      statusCounts[group.status] = group._count._all;
    }

    return {
      message: 'Student overview fetched successfully',
      data: {
        profile: student,
        credits: {
          totalCredits: creditBalance?.totalCredits ?? 0,
          totalCreditSpent: creditSpentAggregate._sum.creditCost ?? 0,
        },
        bookings: {
          totalBookings,
          statusCounts,
          upcomingClassesCount,
          upcomingClasses,
        },
        tutors: {
          assignedTutorCount: assignedTutorRows.length,
        },
        transactions: {
          totalTransactions: transactionCount,
          totalPaidAmount: paidAmountAggregate._sum.amountPaid ?? 0,
        },
        logs: studentLogs.map((studentLog) =>
          this.formatStudentLog(studentLog),
        ),
      },
    };
  }

  async getAdminStudentBookingHistory(
    studentId: string,
    query: AdminStudentLogQueryDto,
  ) {
    await this.getStudentOrThrow(studentId);

    const pagination = this.getPagination(query);
    const where: Prisma.BookingWhereInput = {
      ...this.getStudentBookingWhere(studentId),
      status: query.status,
    };

    const [bookings, total] = await Promise.all([
      this.prisma.client.booking.findMany({
        where,
        include: this.adminBookingInclude,
        orderBy: {
          createdAt: 'desc',
        },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.client.booking.count({
        where,
      }),
    ]);

    return this.getPaginatedResponse(
      'Student booking history fetched successfully',
      bookings,
      pagination,
      total,
    );
  }

  async getAdminStudentUpcomingClasses(
    studentId: string,
    query: AdminStudentLogQueryDto,
  ) {
    await this.getStudentOrThrow(studentId);

    const pagination = this.getPagination(query);
    const where: Prisma.BookingWhereInput = {
      ...this.getStudentBookingWhere(studentId),
      status: BookingStatus.SCHEDULED,
      scheduledAt: {
        gte: new Date(),
      },
    };

    const [classes, total] = await Promise.all([
      this.prisma.client.booking.findMany({
        where,
        include: this.adminBookingInclude,
        orderBy: {
          scheduledAt: 'asc',
        },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.client.booking.count({
        where,
      }),
    ]);

    return this.getPaginatedResponse(
      'Student upcoming classes fetched successfully',
      classes,
      pagination,
      total,
    );
  }

  async getAdminStudentTransactionHistory(
    studentId: string,
    query: AdminStudentLogQueryDto,
  ) {
    await this.getStudentOrThrow(studentId);

    const pagination = this.getPagination(query);
    const where: Prisma.StudentSubscriptionPaymentWhereInput = {
      studentId,
    };

    const [payments, total] = await Promise.all([
      this.prisma.client.studentSubscriptionPayment.findMany({
        where,
        include: this.paymentInclude,
        orderBy: {
          createdAt: 'desc',
        },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.client.studentSubscriptionPayment.count({
        where,
      }),
    ]);

    return this.getPaginatedResponse(
      'Student transaction history fetched successfully',
      payments.map((payment) => this.formatSubscriptionPayment(payment)),
      pagination,
      total,
    );
  }

  async getAdminStudentAssignedTutors(studentId: string) {
    await this.getStudentOrThrow(studentId);

    const bookingWhere = this.getStudentBookingWhere(studentId);
    const tutorBookings = await this.prisma.client.booking.findMany({
      where: {
        ...bookingWhere,
        tutorId: {
          not: null,
        },
      },
      distinct: ['tutorId'],
      select: {
        tutorId: true,
        tutor: {
          select: this.userSummarySelect,
        },
      },
    });

    const tutors = await Promise.all(
      tutorBookings
        .filter((booking) => booking.tutorId && booking.tutor)
        .map(async (booking) => {
          const tutorId = booking.tutorId as string;
          const [totalBookings, upcomingBookings, completedBookings, latest] =
            await Promise.all([
              this.prisma.client.booking.count({
                where: {
                  ...bookingWhere,
                  tutorId,
                },
              }),
              this.prisma.client.booking.count({
                where: {
                  ...bookingWhere,
                  tutorId,
                  status: BookingStatus.SCHEDULED,
                  scheduledAt: {
                    gte: new Date(),
                  },
                },
              }),
              this.prisma.client.booking.count({
                where: {
                  ...bookingWhere,
                  tutorId,
                  status: BookingStatus.COMPLETED,
                },
              }),
              this.prisma.client.booking.findFirst({
                where: {
                  ...bookingWhere,
                  tutorId,
                },
                orderBy: {
                  scheduledAt: 'desc',
                },
                select: {
                  scheduledAt: true,
                },
              }),
            ]);

          const competencyLog =
            await this.prisma.client.studentLogCompetency.findUnique({
              where: {
                studentId_tutorId: {
                  studentId,
                  tutorId,
                },
              },
              select: this.studentLogScoreSelect,
            });

          return {
            tutor: booking.tutor,
            totalBookings,
            upcomingBookings,
            completedBookings,
            latestBookingAt: latest?.scheduledAt ?? null,
            competencyLog: competencyLog
              ? this.formatStudentLog(competencyLog)
              : null,
          };
        }),
    );

    return {
      message: 'Student assigned tutors fetched successfully',
      data: {
        totalTutors: tutors.length,
        tutors,
      },
    };
  }
}
