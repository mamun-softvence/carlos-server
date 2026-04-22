import { randomUUID } from 'crypto';
import { PrismaService } from '@/lib/prisma/prisma.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingCreatedBy,
  BookingStatus,
  LiveClassStatus,
  Prisma,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { StudentCreateBookingRequestDto } from '../dto/student-create-booking-request.dto';
import { AdminAssignTutorDto } from '../dto/admin-assign-tutor.dto';
import { TutorCreateBookingDto } from '../dto/tutor-create-booking.dto';
import { UpdateBookingRuleDto } from '../../admin/dto/update-booking-rule.dto';

type BookingRuleRow = {
  id: string;
  minimumNoticeHours: number;
  cancellationHours: number;
  createdAt: Date;
  updatedAt: Date;
};

type BookingWithParticipants = Prisma.BookingGetPayload<{
  include: {
    student: {
      select: { id: true; name: true; email: true; avatarUrl: true };
    };
    tutor: {
      select: { id: true; name: true; email: true; avatarUrl: true };
    };
    assignedByAdmin: {
      select: { id: true; name: true; email: true };
    };
  };
}>;

@Injectable()
export class BookingService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly bookingInclude = {
    student: {
      select: { id: true, name: true, email: true, avatarUrl: true },
    },
    tutor: {
      select: { id: true, name: true, email: true, avatarUrl: true },
    },
    assignedByAdmin: {
      select: { id: true, name: true, email: true },
    },
  } as const;

  private async createBookingRule(
    minimumNoticeHours: number,
    cancellationHours: number,
  ) {
    const id = randomUUID();
    const now = new Date();

    const createdRules = await this.prisma.client.$queryRaw<BookingRuleRow[]>`
      INSERT INTO "booking_rules" (
        "id",
        "minimumNoticeHours",
        "cancellationHours",
        "createdAt",
        "updatedAt"
      )
      VALUES (${id}, ${minimumNoticeHours}, ${cancellationHours}, ${now}, ${now})
      RETURNING
        "id",
        "minimumNoticeHours",
        "cancellationHours",
        "createdAt",
        "updatedAt"
    `;

    return createdRules[0];
  }

  private async findBookingRule() {
    const rules = await this.prisma.client.$queryRaw<BookingRuleRow[]>`
      SELECT
        "id",
        "minimumNoticeHours",
        "cancellationHours",
        "createdAt",
        "updatedAt"
      FROM "booking_rules"
      ORDER BY "createdAt" ASC
      LIMIT 1
    `;

    return rules[0] ?? null;
  }

  private async getOrCreateBookingRule() {
    const existingRule = await this.findBookingRule();

    if (existingRule) {
      return existingRule;
    }

    return this.createBookingRule(24, 12);
  }

  private assertCancellationWindowOpen(
    booking: { scheduledAt: Date | null },
    bookingRule: Pick<BookingRuleRow, 'cancellationHours'>,
  ) {
    if (!booking.scheduledAt) {
      return;
    }

    const cancellationDeadline = new Date(
      booking.scheduledAt.getTime() -
        bookingRule.cancellationHours * 60 * 60 * 1000,
    );

    if (new Date() > cancellationDeadline) {
      throw new BadRequestException(
        `Booking cannot be cancelled within ${bookingRule.cancellationHours} hours of the scheduled time`,
      );
    }
  }

  private assertMinimumNotice(
    requestedAt: Date,
    bookingRule: Pick<BookingRuleRow, 'minimumNoticeHours'>,
  ) {
    if (Number.isNaN(requestedAt.getTime())) {
      throw new BadRequestException('Invalid booking date');
    }

    const minimumAllowedTime = new Date(
      Date.now() + bookingRule.minimumNoticeHours * 60 * 60 * 1000,
    );

    if (requestedAt < minimumAllowedTime) {
      throw new BadRequestException(
        `Booking must be requested at least ${bookingRule.minimumNoticeHours} hours before the scheduled time`,
      );
    }
  }

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.status === UserStatus.INACTIVE) {
      throw new BadRequestException('User is inactive');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new BadRequestException('User is suspended');
    }

    return user;
  }

  private async ensureUserRole(userId: string, role: UserRole) {
    const user = await this.ensureUserExists(userId);

    if (user.role !== role) {
      throw new BadRequestException(`User is not a ${role.toLowerCase()}`);
    }

    return user;
  }

  private async ensureStudentHasCredit(
    studentId: string,
    tx: Prisma.TransactionClient | PrismaService['client'] = this.prisma.client,
  ) {
    const creditBalance = await tx.studentCreditBalance.findUnique({
      where: {
        studentId,
      },
      select: {
        totalCredits: true,
      },
    });

    if (!creditBalance || creditBalance.totalCredits < 1) {
      throw new BadRequestException('Student does not have enough credit');
    }

    return creditBalance;
  }

  private async deductStudentCredit(
    studentId: string,
    tx: Prisma.TransactionClient,
  ) {
    const deducted = await tx.studentCreditBalance.updateMany({
      where: {
        studentId,
        totalCredits: {
          gte: 1,
        },
      },
      data: {
        totalCredits: {
          decrement: 1,
        },
      },
    });

    if (deducted.count === 0) {
      throw new BadRequestException('Student does not have enough credit');
    }
  }

  private async refundBookingCredit(
    booking: {
      studentId: string;
      creditCost: number;
      creditDeductedAt: Date | null;
      creditRefundedAt: Date | null;
    },
    tx: Prisma.TransactionClient,
  ) {
    if (
      booking.creditCost < 1 ||
      !booking.creditDeductedAt ||
      booking.creditRefundedAt
    ) {
      return false;
    }

    await tx.studentCreditBalance.upsert({
      where: {
        studentId: booking.studentId,
      },
      update: {
        totalCredits: {
          increment: booking.creditCost,
        },
      },
      create: {
        studentId: booking.studentId,
        totalCredits: booking.creditCost,
      },
    });

    return true;
  }

  private async getBookingOrThrow(bookingId: string) {
    const booking = await this.prisma.client.booking.findUnique({
      where: { id: bookingId },
      include: this.bookingInclude,
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return booking;
  }

  async getAllBookings(adminId: string) {
    await this.ensureUserRole(adminId, UserRole.ADMIN);

    const bookings = await this.prisma.client.booking.findMany({
      include: this.bookingInclude,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      message: 'All bookings fetched successfully',
      data: bookings,
    };
  }

  async getBookingRule() {
    const bookingRule = await this.getOrCreateBookingRule();

    return {
      message: 'Booking rule fetched successfully',
      data: bookingRule,
    };
  }

  async updateBookingRule(adminId: string, dto: UpdateBookingRuleDto) {
    await this.ensureUserRole(adminId, UserRole.ADMIN);

    const bookingRule = await this.findBookingRule();

    if (!bookingRule) {
      return {
        message: 'Booking rule updated successfully',
        data: await this.createBookingRule(
          dto.minimumNoticeHours,
          dto.cancellationHours,
        ),
      };
    }

    const updatedRules = await this.prisma.client.$queryRaw<BookingRuleRow[]>`
      UPDATE "booking_rules"
      SET
        "minimumNoticeHours" = ${dto.minimumNoticeHours},
        "cancellationHours" = ${dto.cancellationHours},
        "updatedAt" = NOW()
      WHERE "id" = ${bookingRule.id}
      RETURNING
        "id",
        "minimumNoticeHours",
        "cancellationHours",
        "createdAt",
        "updatedAt"
    `;

    return {
      message: 'Booking rule updated successfully',
      data: updatedRules[0],
    };
  }

  async createStudentRequest(
    studentId: string,
    dto: StudentCreateBookingRequestDto,
  ) {
    await this.ensureUserRole(studentId, UserRole.STUDENT);
    await this.ensureStudentHasCredit(studentId);

    const requestedDate = dto.requestedDate
      ? new Date(dto.requestedDate)
      : null;

    // if (requestedDate) {
    //   const bookingRule = await this.getOrCreateBookingRule();
    //   this.assertMinimumNotice(requestedDate, bookingRule);
    // }

    const booking = await this.prisma.client.booking.create({
      data: {
        studentId,
        createdBy: BookingCreatedBy.STUDENT,
        status: BookingStatus.PENDING,
        liveClassStatus: LiveClassStatus.SCHEDULED,
        topic: dto.topic,
        note: dto.note,
        requestedDate,
        requestedTimeLabel: dto.requestedTimeLabel,
      },
      include: {
        student: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
    });

    return {
      message: 'Booking request created successfully',
      data: booking,
    };
  }

  async assignTutor(
    adminId: string,
    bookingId: string,
    dto: AdminAssignTutorDto,
  ) {
    await this.ensureUserRole(adminId, UserRole.ADMIN);
    await this.ensureUserRole(dto.tutorId, UserRole.TUTOR);

    return this.prisma.client.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
      });

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      if (booking.status === BookingStatus.CANCELLED) {
        throw new BadRequestException(
          'Cannot assign tutor to cancelled booking',
        );
      }

      if (booking.status === BookingStatus.COMPLETED) {
        throw new BadRequestException(
          'Cannot assign tutor to completed booking',
        );
      }

      const scheduledAt = new Date(dto.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) {
        throw new BadRequestException('Invalid scheduledAt date');
      }

      const conflictingBooking = await tx.booking.findFirst({
        where: {
          tutorId: dto.tutorId,
          status: BookingStatus.SCHEDULED,
          scheduledAt,
        },
      });

      if (conflictingBooking && conflictingBooking.id !== bookingId) {
        throw new BadRequestException(
          'Tutor already has a scheduled class at this time',
        );
      }

      const shouldDeductCredit = !booking.creditDeductedAt;

      if (shouldDeductCredit) {
        await this.deductStudentCredit(booking.studentId, tx);
      }

      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          tutorId: dto.tutorId,
          assignedByAdminId: adminId,
          scheduledAt,
          durationMinutes: dto.durationMinutes,
          topic: dto.topic ?? booking.topic,
          courseReference: dto.courseReference ?? booking.courseReference,
          moduleReference: dto.moduleReference ?? booking.moduleReference,
          note: dto.note ?? booking.note,
          status: BookingStatus.SCHEDULED,
          liveClassStatus: LiveClassStatus.SCHEDULED,
          startedAt: null,
          endedAt: null,
          creditCost: shouldDeductCredit ? 1 : booking.creditCost,
          creditDeductedAt: shouldDeductCredit
            ? new Date()
            : booking.creditDeductedAt,
        },
        include: this.bookingInclude,
      });

      return {
        message: 'Tutor assigned successfully',
        data: updated,
      };
    });
  }

  async tutorCreateBooking(tutorId: string, dto: TutorCreateBookingDto) {
    await this.ensureUserRole(tutorId, UserRole.TUTOR);
    await this.ensureUserRole(dto.studentId, UserRole.STUDENT);

    const scheduledAt = new Date(dto.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduledAt date');
    }

    const bookingRule = await this.getOrCreateBookingRule();
    this.assertMinimumNotice(scheduledAt, bookingRule);

    return this.prisma.client.$transaction(async (tx) => {
      const conflict = await tx.booking.findFirst({
        where: {
          tutorId,
          status: BookingStatus.SCHEDULED,
          scheduledAt,
        },
      });

      if (conflict) {
        throw new BadRequestException(
          'You already have a scheduled class at this time',
        );
      }

      await this.deductStudentCredit(dto.studentId, tx);

      const booking = await tx.booking.create({
        data: {
          studentId: dto.studentId,
          tutorId,
          createdBy: BookingCreatedBy.TUTOR,
          status: BookingStatus.SCHEDULED,
          liveClassStatus: LiveClassStatus.SCHEDULED,
          scheduledAt,
          durationMinutes: dto.durationMinutes,
          topic: dto.topic,
          courseReference: dto.courseReference,
          moduleReference: dto.moduleReference,
          note: dto.note,
          creditCost: 1,
          creditDeductedAt: new Date(),
        },
        include: {
          student: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
          tutor: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      });

      return {
        message: 'Class scheduled successfully',
        data: booking,
      };
    });
  }

  async cancelBooking(
    actorId: string,
    bookingId: string,
    actorRole: UserRole,
    cancelReason?: string,
  ) {
    const booking = await this.prisma.client.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Booking already cancelled');
    }

    const isStudentOwner =
      actorRole === UserRole.STUDENT && booking.studentId === actorId;

    const isTutorOwner =
      actorRole === UserRole.TUTOR && booking.tutorId === actorId;
    const isAdmin = actorRole === UserRole.ADMIN;

    if (!isStudentOwner && !isTutorOwner && !isAdmin) {
      throw new ForbiddenException('You cannot cancel this booking');
    }

    const bookingRule = await this.getOrCreateBookingRule();
    this.assertCancellationWindowOpen(booking, bookingRule);

    const updated = await this.prisma.client.$transaction(async (tx) => {
      const currentBooking = await tx.booking.findUnique({
        where: { id: bookingId },
      });

      if (!currentBooking) {
        throw new NotFoundException('Booking not found');
      }

      if (currentBooking.status === BookingStatus.CANCELLED) {
        throw new BadRequestException('Booking already cancelled');
      }

      this.assertCancellationWindowOpen(currentBooking, bookingRule);

      const refunded = await this.refundBookingCredit(currentBooking, tx);

      return tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.CANCELLED,
          liveClassStatus: LiveClassStatus.ENDED,
          cancelledAt: new Date(),
          endedAt: currentBooking.endedAt ?? new Date(),
          cancelReason,
          creditRefundedAt: refunded
            ? new Date()
            : currentBooking.creditRefundedAt,
        },
        include: {
          student: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
          tutor: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      });
    });

    return {
      message: 'Booking cancelled successfully',
      data: updated,
    };
  }
}
