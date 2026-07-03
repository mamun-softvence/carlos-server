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
import { NotificationService } from '../../notification/services/notification.service';
import { MediaRoomManagerService } from './media-room-manager.service';
import { GoogleCalendarService } from '../../google-calendar/google-calendar.service';

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
      : [booking.studentId];
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

  private getParticipantStudents(booking: BookingWithParticipants) {
    const students = new Map<string, typeof booking.student>();

    students.set(booking.student.id, booking.student);

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

    await this.notificationService.createForAdmins({
      type: 'STUDENT_BOOKING_REQUEST',
      title: 'New booking request',
      message: `${booking.student.name ?? booking.student.email} requested a schedule.`,
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
    ];

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
      await this.notificationService.createMany([updated.tutorId], {
        type: 'TUTOR_ASSIGNED_BOOKING',
        title: 'New scheduled booking',
        message: `You have been assigned a booking with ${updated.student.name ?? updated.student.email}.`,
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
}
