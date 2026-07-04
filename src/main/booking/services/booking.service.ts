import { randomUUID } from 'crypto';
import { PrismaService } from '@/lib/prisma/prisma.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingCreatedBy,
  BookingStatus,
  LiveClassStatus,
  Prisma,
  RecurringFrequency,
  TutorBookingType,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { StudentCreateBookingRequestDto } from '../dto/student-create-booking-request.dto';
import { AdminAssignTutorDto } from '../dto/admin-assign-tutor.dto';
import { TutorCreateBookingDto } from '../dto/tutor-create-booking.dto';
import { UpdateBookingRuleDto } from '../../admin/dto/update-booking-rule.dto';
import { NotificationService } from '../../notification/services/notification.service';
import { MediaRoomManagerService } from './media-room-manager.service';
import { GoogleCalendarService } from '../../google-calendar/google-calendar.service';
import { TutorCreateCasualBookingDto } from '../dto/tutor-create-casual-booking.dto';

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
    participants: {
      select: {
        student: {
          select: { id: true; name: true; email: true; avatarUrl: true };
        };
      };
    };
  };
}>;

type BookingStudentSummary = NonNullable<BookingWithParticipants['student']>;

@Injectable()
export class BookingService {
  private static readonly fixedLessonDurationMinutes = 50;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly mediaRoomManager: MediaRoomManagerService,
    private readonly googleCalendarService: GoogleCalendarService,
  ) {}

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
      select: { id: true, name: true, email: true },
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
    booking: { scheduledAt: Date | null; studentId?: string | null },
    bookingRule: Pick<BookingRuleRow, 'cancellationHours'>,
  ) {
    if (!booking.scheduledAt || !booking.studentId) {
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

  private assertFixedLessonDuration(durationMinutes: number) {
    if (durationMinutes !== BookingService.fixedLessonDurationMinutes) {
      throw new BadRequestException(
        `Lesson duration must be exactly ${BookingService.fixedLessonDurationMinutes} minutes`,
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

  private getTutorBookingStudentIds(dto: TutorCreateBookingDto) {
    const studentIds = [
      ...(dto.studentId ? [dto.studentId] : []),
      ...(dto.studentIds ?? []),
    ];
    const uniqueStudentIds = [...new Set(studentIds)];

    if (uniqueStudentIds.length === 0) {
      throw new BadRequestException('At least one student is required');
    }

    return uniqueStudentIds;
  }

  private async ensureStudents(studentIds: string[]) {
    const students = await this.prisma.client.user.findMany({
      where: {
        id: {
          in: studentIds,
        },
      },
      select: {
        id: true,
        role: true,
        status: true,
      },
    });

    const studentsById = new Map(
      students.map((student) => [student.id, student]),
    );

    for (const studentId of studentIds) {
      const student = studentsById.get(studentId);

      if (!student) {
        throw new NotFoundException('Student not found');
      }

      if (student.status === UserStatus.INACTIVE) {
        throw new BadRequestException('Student is inactive');
      }

      if (student.status === UserStatus.SUSPENDED) {
        throw new BadRequestException('Student is suspended');
      }

      if (student.role !== UserRole.STUDENT) {
        throw new BadRequestException('User is not a student');
      }
    }
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
      id: string;
      studentId: string | null;
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

    const participants = await tx.bookingParticipant.findMany({
      where: {
        bookingId: booking.id,
      },
      select: {
        studentId: true,
      },
    });
    const participantStudentIds = [
      ...new Set(participants.map((participant) => participant.studentId)),
    ];
    const shouldRefundParticipants =
      participantStudentIds.length > 1 &&
      booking.creditCost >= participantStudentIds.length;
    const refundStudentIds = shouldRefundParticipants
      ? participantStudentIds
      : booking.studentId
        ? [booking.studentId]
        : [];

    if (refundStudentIds.length === 0) {
      return false;
    }

    const creditIncrement = shouldRefundParticipants ? 1 : booking.creditCost;

    for (const studentId of refundStudentIds) {
      await tx.studentCreditBalance.upsert({
        where: {
          studentId,
        },
        update: {
          totalCredits: {
            increment: creditIncrement,
          },
        },
        create: {
          studentId,
          totalCredits: creditIncrement,
        },
      });
    }

    return true;
  }

  private createBookingParticipants(studentIds: string[]) {
    return {
      createMany: {
        data: studentIds.map((studentId) => ({
          studentId,
        })),
      },
    };
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

  private async syncLiveClassState(bookingId: string) {
    const booking = await this.getBookingOrThrow(bookingId);

    if (booking.status === BookingStatus.CANCELLED) {
      return booking;
    }

    const now = new Date();

    if (
      booking.liveClassStatus === LiveClassStatus.SCHEDULED &&
      booking.status === BookingStatus.SCHEDULED &&
      booking.scheduledAt &&
      booking.scheduledAt <= now
    ) {
      return this.prisma.client.booking.update({
        where: { id: booking.id },
        data: {
          liveClassStatus: LiveClassStatus.LIVE,
          startedAt: booking.startedAt ?? now,
        },
        include: this.bookingInclude,
      });
    }

    return booking;
  }

  private getPrimaryStudent(booking: BookingWithParticipants) {
    return booking.student;
  }

  private getParticipantStudents(booking: BookingWithParticipants) {
    const students = new Map<string, BookingStudentSummary>();
    const primaryStudent = this.getPrimaryStudent(booking);

    if (primaryStudent) {
      students.set(primaryStudent.id, primaryStudent);
    }

    for (const participant of booking.participants) {
      students.set(participant.student.id, participant.student);
    }

    return Array.from(students.values());
  }

  private async getAccessibleLiveClass(
    actorId: string,
    actorRole: UserRole,
    bookingId: string,
  ) {
    const booking = await this.syncLiveClassState(bookingId);

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException(
        'Cancelled bookings cannot be used as live classes',
      );
    }

    if (booking.status === BookingStatus.PENDING) {
      throw new ForbiddenException('This live class is not scheduled yet');
    }

    if (!booking.tutorId) {
      throw new ForbiddenException('This live class does not have a tutor yet');
    }

    const participantStudentIds = new Set(
      this.getParticipantStudents(booking).map((student) => student.id),
    );

    const isTutor = actorRole === UserRole.TUTOR && booking.tutorId === actorId;
    const isStudent =
      actorRole === UserRole.STUDENT && participantStudentIds.has(actorId);
    const isAdmin = actorRole === UserRole.ADMIN;

    if (!isTutor && !isStudent && !isAdmin) {
      throw new ForbiddenException('You do not have access to this live class');
    }

    return booking;
  }

  private async ensureTutorCanManageLiveClass(
    tutorId: string,
    bookingId: string,
  ) {
    const booking = await this.getBookingOrThrow(bookingId);

    if (booking.tutorId !== tutorId) {
      throw new ForbiddenException(
        'Only the assigned tutor can manage this live class',
      );
    }

    if (!booking.scheduledAt) {
      throw new BadRequestException(
        'Live class is missing a scheduled start time',
      );
    }

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Cancelled live classes cannot be started');
    }

    return booking;
  }

  private toLiveClassResponse(
    booking: BookingWithParticipants,
    actorId: string,
  ) {
    const students = this.getParticipantStudents(booking);
    const participantRole =
      booking.tutorId === actorId
        ? 'tutor'
        : students.some((student) => student.id === actorId)
          ? 'student'
          : 'admin';

    return {
      classSessionId: booking.id,
      bookingId: booking.id,
      title: booking.topic,
      topic: booking.topic,
      note: booking.note,
      courseReference: booking.courseReference,
      moduleReference: booking.moduleReference,
      scheduledAt: booking.scheduledAt,
      durationMinutes: booking.durationMinutes,
      status: booking.liveClassStatus.toLowerCase(),
      lifecycleStatus: booking.liveClassStatus,
      bookingStatus: booking.status,
      startedAt: booking.startedAt,
      endedAt: booking.endedAt,
      tutor: booking.tutor,
      students,
      participantRole,
      allowPublishing: participantRole === 'tutor',
      allowScreenShare: participantRole === 'tutor',
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    };
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
        participants: this.createBookingParticipants([studentId]),
      },
      include: this.bookingInclude,
    });

    const studentLabel =
      booking.student?.name ?? booking.student?.email ?? 'A student';

    await this.notificationService.createForAdmins({
      type: 'STUDENT_BOOKING_REQUEST',
      title: 'New booking request',
      message: `${studentLabel} requested a schedule.`,
      data: {
        bookingId: booking.id,
        studentId,
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
    this.assertFixedLessonDuration(dto.durationMinutes);

    const updated = await this.prisma.client.$transaction(async (tx) => {
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
        if (!booking.studentId) {
          throw new BadRequestException(
            'Cannot assign a tutor to a booking without a student',
          );
        }
        await this.deductStudentCredit(booking.studentId, tx);
      }

      return tx.booking.update({
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
    });

    const bookingStudentIds = [
      ...new Set([
        updated.studentId,
        ...updated.participants.map((participant) => participant.student.id),
      ]),
    ].filter((studentId): studentId is string => Boolean(studentId));

    await this.notificationService.createMany(bookingStudentIds, {
      type: 'BOOKING_SCHEDULED',
      title: 'Booking scheduled',
      message: `Your booking has been scheduled with ${updated.tutor?.name ?? updated.tutor?.email ?? 'your tutor'}.`,
      data: {
        bookingId: updated.id,
        tutorId: updated.tutorId,
        scheduledAt: updated.scheduledAt?.toISOString() ?? null,
      },
    });

    if (updated.tutorId) {
      const studentLabel =
        updated.student?.name ?? updated.student?.email ?? 'a student';

      await this.notificationService.createMany([updated.tutorId], {
        type: 'TUTOR_ASSIGNED_BOOKING',
        title: 'New scheduled booking',
        message: `You have been assigned a booking with ${studentLabel}.`,
        data: {
          bookingId: updated.id,
          studentId: updated.studentId,
          scheduledAt: updated.scheduledAt?.toISOString() ?? null,
        },
      });
    }

    await this.notificationService.createForAdmins({
      type: 'ADMIN_BOOKING_SCHEDULED',
      title: 'Booking scheduled',
      message: `Booking ${updated.topic ?? updated.id} has been scheduled.`,
      data: {
        bookingId: updated.id,
        studentId: updated.studentId,
        tutorId: updated.tutorId,
        scheduledAt: updated.scheduledAt?.toISOString() ?? null,
      },
    });

    await this.syncGoogleCalendar(updated.id);

    return {
      message: 'Tutor assigned successfully',
      data: updated,
    };
  }

  async tutorCreateBooking(tutorId: string, dto: TutorCreateBookingDto) {
    await this.ensureUserRole(tutorId, UserRole.TUTOR);
    const studentIds = this.getTutorBookingStudentIds(dto);
    await this.ensureStudents(studentIds);
    this.assertFixedLessonDuration(dto.durationMinutes);

    const scheduledAt = new Date(dto.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduledAt date');
    }

    const bookingRule = await this.getOrCreateBookingRule();
    this.assertMinimumNotice(scheduledAt, bookingRule);

    const booking = await this.prisma.client.$transaction(async (tx) => {
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

      for (const studentId of studentIds) {
        await this.deductStudentCredit(studentId, tx);
      }

      return tx.booking.create({
        data: {
          studentId: studentIds[0],
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
          creditCost: studentIds.length,
          creditDeductedAt: new Date(),
          participants: this.createBookingParticipants(studentIds),
        },
        include: this.bookingInclude,
      });
    });

    await this.notificationService.createMany(studentIds, {
      type: 'TUTOR_BOOKING_SCHEDULED',
      title: 'New class scheduled',
      message: `${booking.tutor?.name ?? booking.tutor?.email ?? 'Your tutor'} scheduled a class.`,
      data: {
        bookingId: booking.id,
        tutorId,
        scheduledAt: booking.scheduledAt?.toISOString() ?? null,
      },
    });

    await this.notificationService.createForAdmins({
      type: 'TUTOR_BOOKING_SCHEDULED_ADMIN',
      title: 'Tutor scheduled a class',
      message: `${booking.tutor?.name ?? booking.tutor?.email ?? 'A tutor'} scheduled a class for ${studentIds.length} student${studentIds.length === 1 ? '' : 's'}.`,
      data: {
        bookingId: booking.id,
        tutorId,
        studentIds,
        scheduledAt: booking.scheduledAt?.toISOString() ?? null,
      },
    });

    await this.syncGoogleCalendar(booking.id);

    return {
      message: 'Class scheduled successfully',
      data: booking,
    };
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
        include: this.bookingInclude,
      });
    });

    await this.syncGoogleCalendar(updated.id);

    return {
      message: 'Booking cancelled successfully',
      data: updated,
    };
  }

  async getLiveClassByBookingId(
    actorId: string,
    actorRole: UserRole,
    bookingId: string,
  ) {
    const booking = await this.getAccessibleLiveClass(
      actorId,
      actorRole,
      bookingId,
    );

    return {
      message: 'Live class fetched successfully',
      data: this.toLiveClassResponse(booking, actorId),
    };
  }

  async getLiveClassMessages(
    actorId: string,
    actorRole: UserRole,
    bookingId: string,
  ) {
    await this.getAccessibleLiveClass(actorId, actorRole, bookingId);

    const messages = await this.prisma.client.liveClassMessage.findMany({
      where: {
        bookingId,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return {
      message: 'Live class chat history fetched successfully',
      data: messages,
    };
  }

  async startLiveClass(actorId: string, bookingId: string) {
    const booking = await this.ensureTutorCanManageLiveClass(
      actorId,
      bookingId,
    );

    if (booking.liveClassStatus === LiveClassStatus.ENDED) {
      throw new BadRequestException('This class has already ended');
    }

    if (booking.liveClassStatus === LiveClassStatus.LIVE) {
      return {
        message: 'Live class is already active',
        data: this.toLiveClassResponse(booking, actorId),
      };
    }

    await this.mediaRoomManager.getOrCreateRoom(booking.id);

    const updated = await this.prisma.client.booking.update({
      where: { id: bookingId },
      data: {
        liveClassStatus: LiveClassStatus.LIVE,
        startedAt: booking.startedAt ?? new Date(),
      },
      include: this.bookingInclude,
    });

    return {
      message: 'Live class started successfully',
      data: this.toLiveClassResponse(updated, actorId),
    };
  }

  async endLiveClass(actorId: string, bookingId: string) {
    const booking = await this.ensureTutorCanManageLiveClass(
      actorId,
      bookingId,
    );

    if (booking.liveClassStatus === LiveClassStatus.ENDED) {
      return {
        message: 'Live class already ended',
        data: this.toLiveClassResponse(booking, actorId),
      };
    }

    const endedAt = new Date();
    const updated = await this.prisma.client.booking.update({
      where: { id: bookingId },
      data: {
        liveClassStatus: LiveClassStatus.ENDED,
        endedAt,
        completedAt: booking.completedAt ?? endedAt,
        status:
          booking.status === BookingStatus.CANCELLED
            ? BookingStatus.CANCELLED
            : BookingStatus.COMPLETED,
      },
      include: this.bookingInclude,
    });

    await this.mediaRoomManager.closeRoom(bookingId);

    return {
      message: 'Live class ended successfully',
      data: this.toLiveClassResponse(updated, actorId),
    };
  }

  async assertCanJoinLiveClass(
    actorId: string,
    actorRole: UserRole,
    bookingId: string,
  ) {
    const booking = await this.getAccessibleLiveClass(
      actorId,
      actorRole,
      bookingId,
    );

    if (booking.liveClassStatus !== LiveClassStatus.LIVE) {
      throw new ForbiddenException('This class is not live yet');
    }

    return this.toLiveClassResponse(booking, actorId);
  }

  async createLiveClassMessage(
    actorId: string,
    actorRole: UserRole,
    bookingId: string,
    message: string,
  ) {
    const booking = await this.getAccessibleLiveClass(
      actorId,
      actorRole,
      bookingId,
    );

    if (booking.liveClassStatus !== LiveClassStatus.LIVE) {
      throw new ForbiddenException(
        'You can only send messages in a live class',
      );
    }

    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      throw new BadRequestException('Message cannot be empty');
    }

    const createdMessage = await this.prisma.client.liveClassMessage.create({
      data: {
        bookingId,
        senderId: actorId,
        message: trimmedMessage,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            role: true,
          },
        },
      },
    });

    return {
      id: createdMessage.id,
      bookingId: createdMessage.bookingId,
      message: createdMessage.message,
      sender: createdMessage.sender,
      createdAt: createdMessage.createdAt,
      updatedAt: createdMessage.updatedAt,
    };
  }

  private async syncGoogleCalendar(bookingId: string) {
    await this.googleCalendarService.syncBooking(bookingId);
  }

  // --- Tutor Recurring Schedules & Casual Bookings Helpers ---

  validateRecurringScheduleDays(
    frequency: RecurringFrequency,
    dayOfWeek?: number,
    dayOfMonth?: number,
  ) {
    if (frequency === RecurringFrequency.WEEKLY || frequency === RecurringFrequency.BIWEEKLY) {
      if (dayOfWeek === undefined || dayOfWeek === null) {
        throw new BadRequestException('dayOfWeek is required for WEEKLY and BIWEEKLY schedules');
      }
    }
    if (frequency === RecurringFrequency.MONTHLY) {
      if (dayOfMonth === undefined || dayOfMonth === null) {
        throw new BadRequestException('dayOfMonth is required for MONTHLY schedules');
      }
    }
  }

  async checkOverlap(
    tutorId: string,
    scheduledAt: Date,
    durationMinutes: number,
    excludeId?: string,
  ): Promise<{ conflictType: 'BOOKING' | 'RECURRING_TEMPLATE'; conflict: any } | null> {
    const start = scheduledAt;
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

    // 1. Check existing non-cancelled bookings for overlap
    // Fetch all bookings within a +/- 24h range to handle same-day checks cleanly
    const dayBefore = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    const dayAfter = new Date(start.getTime() + 24 * 60 * 60 * 1000);

    const bookings = await this.prisma.client.booking.findMany({
      where: {
        tutorId,
        status: { not: BookingStatus.CANCELLED },
        scheduledAt: {
          gte: dayBefore,
          lte: dayAfter,
        },
        id: excludeId ? { not: excludeId } : undefined,
      },
    });

    for (const b of bookings) {
      if (!b.scheduledAt || !b.durationMinutes) continue;
      const bStart = b.scheduledAt;
      const bEnd = new Date(bStart.getTime() + b.durationMinutes * 60 * 1000);

      // Overlap logic: start < bEnd AND end > bStart
      if (start < bEnd && end > bStart) {
        return {
          conflictType: 'BOOKING',
          conflict: {
            id: b.id,
            title: b.topic,
            scheduledAt: b.scheduledAt,
            durationMinutes: b.durationMinutes,
          },
        };
      }
    }

    // 2. Check active recurring schedule templates for overlap
    const templates = await this.prisma.client.tutorRecurringSchedule.findMany({
      where: {
        tutorId,
        isActive: true,
        id: excludeId ? { not: excludeId } : undefined,
      },
    });

    const reqDayOfWeek = start.getDay();
    const reqDayOfMonth = start.getDate();
    
    // Requested time range in minutes from midnight
    const reqStartMinutes = start.getHours() * 60 + start.getMinutes();
    const reqEndMinutes = reqStartMinutes + durationMinutes;

    for (const temp of templates) {
      // Parse template timeOfDay "HH:MM"
      const [tHours, tMinutes] = temp.timeOfDay.split(':').map(Number);
      const tempStartMinutes = tHours * 60 + tMinutes;
      const tempEndMinutes = tempStartMinutes + temp.durationMinutes;

      // Check frequency alignment
      let dayMatches = false;
      if (temp.frequency === RecurringFrequency.DAILY) {
        dayMatches = true;
      } else if (temp.frequency === RecurringFrequency.WEEKLY || temp.frequency === RecurringFrequency.BIWEEKLY) {
        dayMatches = temp.dayOfWeek === reqDayOfWeek;
      } else if (temp.frequency === RecurringFrequency.MONTHLY) {
        dayMatches = temp.dayOfMonth === reqDayOfMonth;
      }

      if (dayMatches) {
        // Check if minutes overlap
        if (reqStartMinutes < tempEndMinutes && reqEndMinutes > tempStartMinutes) {
          return {
            conflictType: 'RECURRING_TEMPLATE',
            conflict: {
              id: temp.id,
              title: temp.title,
              scheduledAt: start, // Representing the conflict on the same checked date
              durationMinutes: temp.durationMinutes,
              timeOfDay: temp.timeOfDay,
              frequency: temp.frequency,
            },
          };
        }
      }
    }

    return null;
  }

  async createCasualBooking(tutorId: string, dto: TutorCreateCasualBookingDto) {
    await this.ensureUserRole(tutorId, UserRole.TUTOR);

    const scheduledAtDate = new Date(dto.scheduledAt);
    if (Number.isNaN(scheduledAtDate.getTime())) {
      throw new BadRequestException('Invalid scheduledAt date format');
    }

    const durationMinutes = dto.durationMinutes ?? 50;

    // Check opening window rule
    const activeTemplates = await this.prisma.client.tutorRecurringSchedule.findMany({
      where: { tutorId, isActive: true },
      select: { openingWindowDays: true },
    });

    const maxWindowDays = activeTemplates.length > 0
      ? Math.max(...activeTemplates.map(t => t.openingWindowDays))
      : 7;

    const limitDate = new Date(Date.now() + maxWindowDays * 24 * 60 * 60 * 1000);
    if (scheduledAtDate < new Date() || scheduledAtDate > limitDate) {
      throw new BadRequestException(
        `Casual booking date must be between now and the tutor's opening window (${maxWindowDays} days in advance)`,
      );
    }

    // Check overlaps
    const overlap = await this.checkOverlap(tutorId, scheduledAtDate, durationMinutes);
    if (overlap) {
      throw new ConflictException({
        message: 'Time slot overlaps with an existing booking or recurring schedule template',
        conflictType: overlap.conflictType,
        conflict: overlap.conflict,
      });
    }

    // If pre-booking a student, verify they exist
    if (dto.studentId) {
      await this.ensureStudents([dto.studentId]);
    }

    const booking = await this.prisma.client.booking.create({
      data: {
        tutorId,
        studentId: dto.studentId,
        createdBy: BookingCreatedBy.TUTOR,
        status: BookingStatus.SCHEDULED,
        liveClassStatus: LiveClassStatus.SCHEDULED,
        topic: dto.title,
        note: dto.description,
        tags: dto.tags || [],
        tutorBookingType: TutorBookingType.CASUAL,
        scheduledAt: scheduledAtDate,
        durationMinutes,
      },
      include: this.bookingInclude,
    });

    // Send notifications
    if (dto.studentId) {
      await this.notificationService.createMany([dto.studentId], {
        type: 'BOOKING_SCHEDULED',
        title: 'New scheduled booking',
        message: `Your tutor scheduled a class: ${booking.topic || 'Class'}.`,
        data: {
          bookingId: booking.id,
          tutorId,
          scheduledAt: booking.scheduledAt?.toISOString() ?? null,
        },
      });
    }

    return {
      message: 'Casual booking scheduled successfully',
      data: booking,
    };
  }

  async getTutorBookings(tutorId: string) {
    await this.ensureUserRole(tutorId, UserRole.TUTOR);
    return this.prisma.client.booking.findMany({
      where: { tutorId },
      include: this.bookingInclude,
      orderBy: { scheduledAt: 'desc' },
    });
  }

  async getTutorBookingById(tutorId: string, bookingId: string) {
    await this.ensureUserRole(tutorId, UserRole.TUTOR);
    const booking = await this.prisma.client.booking.findFirst({
      where: { id: bookingId, tutorId },
      include: this.bookingInclude,
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return booking;
  }
}
