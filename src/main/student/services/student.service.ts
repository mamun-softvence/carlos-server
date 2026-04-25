import { PrismaService } from '@/lib/prisma/prisma.service';
import {
  BookingStatus,
  Prisma,
  SubscriptionStatus,
  UserRole,
} from '@prisma/client';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StudentBookingQueryDto } from '../dto/student-booking-query.dto';
import { UpdateStudentProfileDto } from '../dto/update-student-profile.dto';

@Injectable()
export class StudentService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly creditHistoryBookingSelect = {
    id: true,
    studentId: true,
    topic: true,
    creditCost: true,
    creditDeductedAt: true,
    creditRefundedAt: true,
    tutor: {
      select: {
        name: true,
        email: true,
      },
    },
    participants: {
      select: {
        studentId: true,
      },
    },
  } satisfies Prisma.BookingSelect;

  private readonly studentProfileSelect = {
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
    createdAt: true,
    updatedAt: true,
  } as const;

  private readonly userSummarySelect = {
    id: true,
    name: true,
    email: true,
    avatarUrl: true,
  } as const;

  private readonly bookingInclude = {
    student: {
      select: this.userSummarySelect,
    },
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
      orderBy: {
        createdAt: 'asc',
      },
    },
  } satisfies Prisma.BookingInclude;

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

  private async ensureStudentExists(studentId: string) {
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

    return student;
  }

  private getDayRange(dateInput: string) {
    const start = new Date(dateInput);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    return { start, end };
  }

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

  private getPercentageChange(currentValue: number, previousValue: number) {
    if (previousValue === 0) {
      return currentValue === 0 ? 0 : 100;
    }

    return Number(
      (((currentValue - previousValue) / previousValue) * 100).toFixed(2),
    );
  }

  private getBookingCreditAmountForStudent(
    booking: {
      studentId: string;
      creditCost: number;
      participants: Array<{ studentId: string }>;
    },
    studentId: string,
  ) {
    const participantIds = new Set(
      booking.participants.map((participant) => participant.studentId),
    );
    const isGroupedBooking =
      participantIds.size > 1 && booking.creditCost >= participantIds.size;

    if (isGroupedBooking && participantIds.has(studentId)) {
      return 1;
    }

    if (booking.studentId === studentId) {
      return booking.creditCost;
    }

    return participantIds.has(studentId) ? 1 : 0;
  }

  private getBookingCreditDescription(
    action: 'used' | 'refunded',
    booking: {
      id: string;
      topic: string | null;
      tutor: {
        name: string | null;
        email: string | null;
      } | null;
    },
  ) {
    const bookingLabel = booking.topic ?? `booking ${booking.id}`;
    const tutorLabel = booking.tutor?.name ?? booking.tutor?.email;

    if (action === 'refunded') {
      return `Credit refunded for cancelled ${bookingLabel}`;
    }

    if (tutorLabel) {
      return `Credit used for ${bookingLabel} with ${tutorLabel}`;
    }

    return `Credit used for ${bookingLabel}`;
  }

  async getMyCredits(studentId: string) {
    await this.ensureStudentExists(studentId);

    const creditBalance =
      await this.prisma.client.studentCreditBalance.findUnique({
        where: {
          studentId,
        },
        select: {
          totalCredits: true,
        },
      });

    return {
      message: 'Student credit balance fetched successfully',
      data: {
        totalCredits: creditBalance?.totalCredits ?? 0,
      },
    };
  }

  async getMyOverview(studentId: string) {
    await this.ensureStudentExists(studentId);

    const now = new Date();
    const studentBookingWhere = this.getStudentBookingWhere(studentId);

    const [completedClass, upcomingClasses, totalCreditSpent, creditBalance] =
      await Promise.all([
        this.prisma.client.booking.count({
          where: {
            ...studentBookingWhere,
            status: BookingStatus.COMPLETED,
          },
        }),
        this.prisma.client.booking.count({
          where: {
            AND: [
              studentBookingWhere,
              {
                OR: [
                  {
                    status: BookingStatus.PENDING,
                  },
                  {
                    status: BookingStatus.SCHEDULED,
                    OR: [
                      {
                        scheduledAt: null,
                      },
                      {
                        scheduledAt: {
                          gte: now,
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        }),
        this.prisma.client.booking.count({
          where: {
            ...studentBookingWhere,
            creditDeductedAt: {
              not: null,
            },
            creditRefundedAt: null,
          },
        }),
        this.prisma.client.studentCreditBalance.findUnique({
          where: {
            studentId,
          },
          select: {
            totalCredits: true,
          },
        }),
      ]);

    const remainingCredit = creditBalance?.totalCredits ?? 0;

    return {
      message: 'Student overview fetched successfully',
      data: {
        completedClass,
        upcomingClasses,
        totalCredit: remainingCredit + totalCreditSpent,
        remainingCredit,
      },
    };
  }

  async getMyData(studentId: string) {
    await this.ensureStudentExists(studentId);

    const now = new Date();
    const bookingWhere = this.getStudentBookingWhere(studentId);
    const currentMonthRange = this.getMonthRange(now);
    const previousMonthRange = this.getMonthRange(now, -1);

    const [
      creditBalance,
      totalCreditUsed,
      totalCancellation,
      currentMonthCreditUsed,
      previousMonthCreditUsed,
      currentMonthCancellation,
      previousMonthCancellation,
      currentSubscription,
    ] = await Promise.all([
      this.prisma.client.studentCreditBalance.findUnique({
        where: {
          studentId,
        },
        select: {
          totalCredits: true,
        },
      }),
      this.prisma.client.booking.count({
        where: {
          ...bookingWhere,
          creditDeductedAt: {
            not: null,
          },
          creditRefundedAt: null,
        },
      }),
      this.prisma.client.booking.count({
        where: {
          ...bookingWhere,
          status: BookingStatus.CANCELLED,
        },
      }),
      this.prisma.client.booking.count({
        where: {
          ...bookingWhere,
          creditDeductedAt: {
            gte: currentMonthRange.start,
            lt: currentMonthRange.end,
          },
          creditRefundedAt: null,
        },
      }),
      this.prisma.client.booking.count({
        where: {
          ...bookingWhere,
          creditDeductedAt: {
            gte: previousMonthRange.start,
            lt: previousMonthRange.end,
          },
          creditRefundedAt: null,
        },
      }),
      this.prisma.client.booking.count({
        where: {
          ...bookingWhere,
          status: BookingStatus.CANCELLED,
          cancelledAt: {
            gte: currentMonthRange.start,
            lt: currentMonthRange.end,
          },
        },
      }),
      this.prisma.client.booking.count({
        where: {
          ...bookingWhere,
          status: BookingStatus.CANCELLED,
          cancelledAt: {
            gte: previousMonthRange.start,
            lt: previousMonthRange.end,
          },
        },
      }),
      this.prisma.client.studentSubscription.findFirst({
        where: {
          studentId,
          status: SubscriptionStatus.ACTIVE,
          OR: [{ endDate: null }, { endDate: { gt: now } }],
        },
        select: {
          endDate: true,
          currentPeriodEnd: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
    ]);

    return {
      message: 'Student dashboard summary fetched successfully',
      data: {
        totalCreditUsed,
        remainingCredit: creditBalance?.totalCredits ?? 0,
        totalCancellation,
        creditUsedPercentageFromPreviousMonth: this.getPercentageChange(
          currentMonthCreditUsed,
          previousMonthCreditUsed,
        ),
        currentSubscriptionEndingDate:
          currentSubscription?.currentPeriodEnd ??
          currentSubscription?.endDate ??
          null,
        cancellationPercentageFromPreviousMonth: this.getPercentageChange(
          currentMonthCancellation,
          previousMonthCancellation,
        ),
      },
    };
  }

  async getMyCreditHistory(studentId: string) {
    await this.ensureStudentExists(studentId);

    const bookingWhere = this.getStudentBookingWhere(studentId);

    const [payments, bookings] = await Promise.all([
      this.prisma.client.studentSubscriptionPayment.findMany({
        where: {
          studentId,
        },
        select: {
          id: true,
          paidAt: true,
          createdAt: true,
          plan: {
            select: {
              name: true,
              creditsPerMonth: true,
            },
          },
        },
        orderBy: {
          paidAt: 'desc',
        },
      }),
      this.prisma.client.booking.findMany({
        where: {
          ...bookingWhere,
          OR: [
            {
              creditDeductedAt: {
                not: null,
              },
            },
            {
              creditRefundedAt: {
                not: null,
              },
            },
          ],
        },
        select: this.creditHistoryBookingSelect,
      }),
    ]);

    const history = [
      ...payments.map((payment) => ({
        date: payment.paidAt ?? payment.createdAt,
        description: `Subscription credits added${payment.plan?.name ? ` from ${payment.plan.name}` : ''}`,
        creditAmount: payment.plan?.creditsPerMonth ?? 0,
      })),
      ...bookings.flatMap((booking) => {
        const creditAmount = this.getBookingCreditAmountForStudent(
          booking,
          studentId,
        );

        if (creditAmount < 1) {
          return [];
        }

        const items: Array<{
          date: Date;
          description: string;
          creditAmount: number;
        }> = [];

        if (booking.creditDeductedAt) {
          items.push({
            date: booking.creditDeductedAt,
            description: this.getBookingCreditDescription('used', booking),
            creditAmount: -creditAmount,
          });
        }

        if (booking.creditRefundedAt) {
          items.push({
            date: booking.creditRefundedAt,
            description: this.getBookingCreditDescription('refunded', booking),
            creditAmount,
          });
        }

        return items;
      }),
    ].sort((a, b) => b.date.getTime() - a.date.getTime());

    return {
      message: 'Student credit history fetched successfully',
      data: history,
    };
  }

  async getMyBookings(studentId: string, query: StudentBookingQueryDto) {
    const where: Prisma.BookingWhereInput =
      this.getStudentBookingWhere(studentId);

    if (query.status) {
      where.status = query.status;
    }

    if (query.date) {
      const { start, end } = this.getDayRange(query.date);
      const existingAnd = where.AND
        ? Array.isArray(where.AND)
          ? where.AND
          : [where.AND]
        : [];

      where.AND = [
        ...existingAnd,
        {
          OR: [
            {
              status: BookingStatus.PENDING,
              requestedDate: {
                gte: start,
                lt: end,
              },
            },
            {
              status: {
                in: [
                  BookingStatus.SCHEDULED,
                  BookingStatus.COMPLETED,
                  BookingStatus.CANCELLED,
                ],
              },
              scheduledAt: {
                gte: start,
                lt: end,
              },
            },
          ],
        },
      ];
    }

    const bookings = await this.prisma.client.booking.findMany({
      where,
      include: this.bookingInclude,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      message: 'Student bookings fetched successfully',
      data: bookings,
    };
  }

  async updateProfile(studentId: string, dto: UpdateStudentProfileDto) {
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

    if (dto.email) {
      const existingUser = await this.prisma.client.user.findFirst({
        where: {
          email: dto.email,
          NOT: {
            id: studentId,
          },
        },
        select: {
          id: true,
        },
      });

      if (existingUser) {
        throw new ConflictException('User already exists with this email');
      }
    }

    const updatedStudent = await this.prisma.client.user.update({
      where: { id: studentId },
      data: {
        name: dto.name,
        email: dto.email,
        phoneNumber: dto.phoneNumber,
        timeZone: dto.timeZone,
        googleCalendarEnabled: dto.googleCalendarEnabled,
      },
      select: this.studentProfileSelect,
    });

    return {
      message: 'Student profile updated successfully',
      data: updatedStudent,
    };
  }
}
