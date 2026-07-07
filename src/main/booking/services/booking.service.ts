import { randomUUID } from 'crypto';
import { PrismaService } from '@/lib/prisma/prisma.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
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
  TutorSubRole,
  LessonType,
} from '@prisma/client';
import { StudentCreateBookingRequestDto } from '../dto/student-create-booking-request.dto';
import { AdminAssignTutorDto } from '../dto/admin-assign-tutor.dto';
import { TutorCreateBookingDto } from '../dto/tutor-create-booking.dto';
import { UpdateBookingRuleDto } from '../../admin/dto/update-booking-rule.dto';
import { NotificationService } from '../../notification/services/notification.service';
import { MediaRoomManagerService } from './media-room-manager.service';
import { GoogleCalendarService } from '../../google-calendar/google-calendar.service';
import { TutorCreateCasualBookingDto } from '../dto/tutor-create-casual-booking.dto';
import { StudentSearchBookingsDto } from '../dto/student-search-bookings.dto';
import { StudentBookBatchDto } from '../dto/student-book-batch.dto';
import { TutorCreateAvailabilityDto } from '../dto/tutor-create-availability.dto';
import { StudentBookAvailabilityDto } from '../dto/student-book-availability.dto';
import { TutorGenerateAvailabilityDto } from '../dto/tutor-generate-availability.dto';
import {
  StudentTutorSearchQueryDto,
  StudentTutorSortBy,
} from '../dto/student-tutor-search-query.dto';
import { StudentTutorScheduleQueryDto } from '../dto/student-tutor-schedule-query.dto';
import { SortOrder } from '../dto/student-search-bookings.dto';

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
  private readonly logger = new Logger(BookingService.name);
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

  public validateTutorLessonCapability(
    tutor: { tutorRoles: TutorSubRole[] },
    lessonType: LessonType,
  ) {
    if (
      lessonType === LessonType.CONVERSATION &&
      !tutor.tutorRoles.includes(TutorSubRole.CONVERSATION)
    ) {
      throw new ForbiddenException(
        'Tutor is not authorized to teach conversation lessons',
      );
    }
    if (
      lessonType === LessonType.REGULAR &&
      !tutor.tutorRoles.includes(TutorSubRole.REGULAR)
    ) {
      throw new ForbiddenException(
        'Tutor is not authorized to teach regular lessons',
      );
    }
    if (lessonType === LessonType.BOTH) {
      if (
        !tutor.tutorRoles.includes(TutorSubRole.REGULAR) ||
        !tutor.tutorRoles.includes(TutorSubRole.CONVERSATION)
      ) {
        throw new ForbiddenException(
          'Tutor must have both regular and conversation roles to teach both lesson types',
        );
      }
    }
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

  private getNextOccurrenceForMultipleWeekdays(
    base: Date,
    frequency: RecurringFrequency,
    dayOfWeek: number[],
    startDate: Date,
  ): Date {
    const startOfWeek = new Date(startDate);
    startOfWeek.setDate(startDate.getDate() - startDate.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const current = new Date(base);
    current.setDate(current.getDate() + 1);
    while (true) {
      const currentDay = current.getDay();
      if (dayOfWeek.includes(currentDay)) {
        if (frequency === RecurringFrequency.WEEKLY) {
          return current;
        }
        if (frequency === RecurringFrequency.BIWEEKLY) {
          const currentSunday = new Date(current);
          currentSunday.setDate(current.getDate() - current.getDay());
          currentSunday.setHours(0, 0, 0, 0);

          const diffMs = currentSunday.getTime() - startOfWeek.getTime();
          const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
          if (diffWeeks % 2 === 0) {
            return current;
          }
        }
      }
      current.setDate(current.getDate() + 1);
      if (current.getTime() - base.getTime() > 1000 * 24 * 60 * 60 * 365) {
        break; // safety cutoff
      }
    }
    return current;
  }

  private getTemplateOccurrenceDateTime(
    startDate: Date,
    frequency: RecurringFrequency,
    index: number,
    dayOfWeek?: number[] | null,
  ): Date {
    if (
      (frequency === RecurringFrequency.WEEKLY ||
        frequency === RecurringFrequency.BIWEEKLY) &&
      dayOfWeek &&
      dayOfWeek.length > 0
    ) {
      let current = new Date(startDate);
      for (let step = 0; step < index; step++) {
        current = this.getNextOccurrenceForMultipleWeekdays(
          current,
          frequency,
          dayOfWeek,
          startDate,
        );
      }
      return current;
    }

    const date = new Date(startDate);
    if (frequency === RecurringFrequency.DAILY) {
      date.setDate(date.getDate() + index);
    } else if (frequency === RecurringFrequency.WEEKLY) {
      date.setDate(date.getDate() + index * 7);
    } else if (frequency === RecurringFrequency.BIWEEKLY) {
      date.setDate(date.getDate() + index * 14);
    } else if (frequency === RecurringFrequency.MONTHLY) {
      date.setMonth(date.getMonth() + index);
    }
    return date;
  }

  private getTemplateOccurrenceIndexAfter(
    startDate: Date,
    frequency: RecurringFrequency,
    baseDate: Date,
    dayOfWeek?: number[] | null,
  ): number {
    const diffMs = baseDate.getTime() - startDate.getTime();
    if (diffMs <= 0) {
      return 0;
    }
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    let estimatedIndex = 0;
    if (frequency === RecurringFrequency.DAILY) {
      estimatedIndex = Math.floor(diffDays);
    } else if (frequency === RecurringFrequency.WEEKLY) {
      const multiplier =
        dayOfWeek && dayOfWeek.length > 0 ? dayOfWeek.length : 1;
      estimatedIndex = Math.floor((diffDays / 7) * multiplier);
    } else if (frequency === RecurringFrequency.BIWEEKLY) {
      const multiplier =
        dayOfWeek && dayOfWeek.length > 0 ? dayOfWeek.length : 1;
      estimatedIndex = Math.floor((diffDays / 14) * multiplier);
    } else if (frequency === RecurringFrequency.MONTHLY) {
      estimatedIndex = Math.floor(diffDays / 30.44);
    }
    return Math.max(0, estimatedIndex - 1);
  }

  private getTemplateNextOccurrence(
    frequency: RecurringFrequency,
    startDate: Date,
    baseDate: Date,
    dayOfWeek?: number[] | null,
  ): Date {
    let i = this.getTemplateOccurrenceIndexAfter(
      startDate,
      frequency,
      baseDate,
      dayOfWeek,
    );
    while (true) {
      const occurrence = this.getTemplateOccurrenceDateTime(
        startDate,
        frequency,
        i,
        dayOfWeek,
      );
      if (occurrence > baseDate) {
        return occurrence;
      }
      i++;
      if (i > 100000) {
        return occurrence;
      }
    }
  }

  async checkOverlap(
    tutorId: string,
    scheduledAt: Date,
    durationMinutes: number,
    excludeId?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{
    conflictType: 'BOOKING' | 'RECURRING_TEMPLATE';
    conflict: any;
  } | null> {
    const prisma = tx || this.prisma.client;
    const start = scheduledAt;
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

    // 1. Check existing non-cancelled bookings for overlap
    const dayBefore = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    const dayAfter = new Date(start.getTime() + 24 * 60 * 60 * 1000);

    const bookings = await prisma.booking.findMany({
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
    const templates = await prisma.tutorRecurringSchedule.findMany({
      where: {
        tutorId,
        isActive: true,
        id: excludeId ? { not: excludeId } : undefined,
      },
    });

    for (const temp of templates) {
      // Calculate the duration in minutes for the template
      const tempDurationMinutes = temp.durationHours * 60 - 10;
      // Calculate the single candidate occurrence of this template that could overlap
      const checkBase = new Date(
        start.getTime() - tempDurationMinutes * 60 * 1000,
      );
      const occurrence = this.getTemplateNextOccurrence(
        temp.frequency,
        temp.startDate,
        checkBase,
        temp.dayOfWeek,
      );
      const tempEnd = new Date(
        occurrence.getTime() + tempDurationMinutes * 60 * 1000,
      );

      // Check if it overlaps with the requested slot
      if (occurrence < end && tempEnd > start) {
        return {
          conflictType: 'RECURRING_TEMPLATE',
          conflict: {
            id: temp.id,
            title: temp.title,
            scheduledAt: occurrence,
            durationMinutes: tempDurationMinutes,
            frequency: temp.frequency,
          },
        };
      }
    }

    return null;
  }

  async createCasualBooking(tutorId: string, dto: TutorCreateCasualBookingDto) {
    const tutor = await this.ensureUserRole(tutorId, UserRole.TUTOR);

    const lessonType = dto.lessonType ?? LessonType.REGULAR;
    this.validateTutorLessonCapability(tutor, lessonType);

    const scheduledAtDate = new Date(dto.scheduledAt);
    if (Number.isNaN(scheduledAtDate.getTime())) {
      throw new BadRequestException('Invalid scheduledAt date format');
    }

    const durationHours = dto.durationHours ?? 1;
    const isPackage = durationHours > 1;

    if (scheduledAtDate < new Date()) {
      throw new BadRequestException(
        'Casual booking date must be in the future',
      );
    }

    // Check overlaps for all segments
    for (let i = 0; i < durationHours; i++) {
      const slotTime = new Date(scheduledAtDate.getTime() + i * 60 * 60 * 1000);
      const overlap = await this.checkOverlap(tutorId, slotTime, 50);
      if (overlap) {
        throw new ConflictException({
          message:
            'Time slot overlaps with an existing booking or recurring schedule template',
          conflictType: overlap.conflictType,
          conflict: overlap.conflict,
        });
      }
    }

    // If pre-booking a student, verify they exist
    if (dto.studentId) {
      await this.ensureStudents([dto.studentId]);
    }

    const groupBookingId = isPackage ? randomUUID() : null;

    const bookings = [];
    for (let i = 0; i < durationHours; i++) {
      const slotTime = new Date(scheduledAtDate.getTime() + i * 60 * 60 * 1000);
      const topic = dto.title || 'Lesson Slot';
      const displayTopic =
        durationHours > 1
          ? `${topic} (Session ${i + 1}/${durationHours})`
          : topic;

      const booking = await this.prisma.client.booking.create({
        data: {
          tutorId,
          studentId: dto.studentId || null,
          createdBy: BookingCreatedBy.TUTOR,
          status: BookingStatus.SCHEDULED,
          liveClassStatus: LiveClassStatus.SCHEDULED,
          topic: displayTopic,
          note: dto.description || '',
          tags: dto.tags || [],
          tutorBookingType: TutorBookingType.CASUAL,
          scheduledAt: slotTime,
          durationMinutes: 50,
          isPackage,
          groupBookingId,
          lessonType,
        },
        include: this.bookingInclude,
      });
      bookings.push(booking);
    }

    // Send notifications using the first booking info
    if (dto.studentId && bookings.length > 0) {
      await this.notificationService.createMany([dto.studentId], {
        type: 'BOOKING_SCHEDULED',
        title: 'New scheduled booking',
        message: `Your tutor scheduled a class: ${dto.title || 'Class'}.`,
        data: {
          bookingId: bookings[0].id,
          tutorId,
          scheduledAt: bookings[0].scheduledAt?.toISOString() ?? null,
        },
      });
    }

    return {
      message: 'Casual booking scheduled successfully',
      data: bookings[0],
      bookings: bookings,
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

  async studentBookSlot(studentId: string, bookingId: string) {
    await this.ensureUserRole(studentId, UserRole.STUDENT);

    const booking = await this.prisma.client.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Booking slot not found');
    }

    const alreadyJoined = await this.prisma.client.bookingParticipant.findFirst(
      {
        where: { bookingId, studentId },
      },
    );
    if (alreadyJoined) {
      throw new BadRequestException('You are already booked for this slot');
    }

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Cannot book a cancelled slot');
    }

    if (booking.scheduledAt && booking.scheduledAt <= new Date()) {
      throw new BadRequestException('Cannot book a slot in the past');
    }

    if (booking.isPackage) {
      throw new BadRequestException(
        'Cannot book a single slot from a package. You must book the entire package together.',
      );
    }

    const updated = await this.prisma.client.$transaction(async (tx) => {
      await this.ensureStudentHasCredit(studentId, tx);
      await this.deductStudentCredit(studentId, tx);

      return tx.booking.update({
        where: { id: bookingId },
        data: {
          studentId: booking.studentId || studentId,
          status: BookingStatus.SCHEDULED,
          creditCost: 1,
          creditDeductedAt: new Date(),
          participants: {
            create: { studentId },
          },
        },
        include: this.bookingInclude,
      });
    });

    await this.notificationService.createMany([studentId], {
      type: 'BOOKING_SCHEDULED',
      title: 'Booking confirmed',
      message: `Your booking for ${updated.topic || 'Class'} is confirmed.`,
      data: {
        bookingId: updated.id,
        scheduledAt: updated.scheduledAt?.toISOString() ?? null,
      },
    });

    await this.syncGoogleCalendar(updated.id);

    return {
      message: 'Booking slot confirmed successfully',
      data: updated,
    };
  }

  async studentBookPackage(studentId: string, recurringScheduleId: string) {
    await this.ensureUserRole(studentId, UserRole.STUDENT);

    const schedule = await this.prisma.client.tutorRecurringSchedule.findUnique(
      {
        where: { id: recurringScheduleId },
      },
    );

    if (!schedule) {
      throw new NotFoundException('Recurring schedule package not found');
    }

    // Find future slots and book only the next occurrence group.
    const unbookedSessions = await this.prisma.client.booking.findMany({
      where: {
        recurringScheduleId,
        status: BookingStatus.SCHEDULED,
        scheduledAt: { gte: new Date() },
        NOT: {
          participants: {
            some: { studentId },
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    if (unbookedSessions.length === 0) {
      throw new BadRequestException(
        'No unbooked sessions available in this package',
      );
    }

    const firstSession = unbookedSessions[0];
    const packageSessions = unbookedSessions.filter((session) => {
      if (firstSession.groupBookingId) {
        return session.groupBookingId === firstSession.groupBookingId;
      }
      return session.recurringScheduleId === recurringScheduleId;
    });
    const requiredCredits = packageSessions.length;

    const result = await this.prisma.client.$transaction(async (tx) => {
      const creditBalance = await tx.studentCreditBalance.findUnique({
        where: { studentId },
        select: { totalCredits: true },
      });

      if (!creditBalance || creditBalance.totalCredits < requiredCredits) {
        throw new BadRequestException(
          `Not enough credits. Required: ${requiredCredits}, Available: ${creditBalance?.totalCredits || 0}`,
        );
      }

      // Deduct credits
      await tx.studentCreditBalance.updateMany({
        where: {
          studentId,
          totalCredits: { gte: requiredCredits },
        },
        data: {
          totalCredits: { decrement: requiredCredits },
        },
      });

      // Update all bookings
      const updatedBookings = [];
      for (const session of packageSessions) {
        const updated = await tx.booking.update({
          where: { id: session.id },
          data: {
            studentId: session.studentId || studentId,
            creditCost: 1,
            creditDeductedAt: new Date(),
            participants: {
              create: { studentId },
            },
          },
          include: this.bookingInclude,
        });
        updatedBookings.push(updated);
      }

      return updatedBookings;
    });

    // Send confirmations
    for (const b of result) {
      await this.notificationService.createMany([studentId], {
        type: 'BOOKING_SCHEDULED',
        title: 'Package booking confirmed',
        message: `Your class for ${b.topic || 'Class'} is confirmed.`,
        data: {
          bookingId: b.id,
          scheduledAt: b.scheduledAt?.toISOString() ?? null,
        },
      });
      await this.syncGoogleCalendar(b.id);
    }

    return {
      message: `Package booked successfully. Confirmed ${result.length} sessions.`,
      data: result,
    };
  }

  async searchAvailableBookings(
    studentId: string,
    dto: StudentSearchBookingsDto,
  ) {
    await this.ensureUserRole(studentId, UserRole.STUDENT);

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 10;
    const sortOrder = dto.sortOrder ?? 'asc';
    const skip = (page - 1) * limit;

    const where: Prisma.BookingWhereInput = {
      studentId: null,
      status: BookingStatus.SCHEDULED,
      scheduledAt: { gte: new Date() },
    };

    if (dto.search) {
      const searchPattern = dto.search;
      where.OR = [
        { topic: { contains: searchPattern, mode: 'insensitive' } },
        { note: { contains: searchPattern, mode: 'insensitive' } },
        {
          tutor: {
            name: { contains: searchPattern, mode: 'insensitive' },
          },
        },
      ];
    }

    where.lessonType = dto.lessonType ?? LessonType.REGULAR;

    const [bookings, total] = await Promise.all([
      this.prisma.client.booking.findMany({
        where,
        include: this.bookingInclude,
        orderBy: { scheduledAt: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.client.booking.count({ where }),
    ]);

    return {
      message: 'Available bookings retrieved successfully',
      data: bookings,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async studentBookBatch(studentId: string, dto: StudentBookBatchDto) {
    await this.ensureUserRole(studentId, UserRole.STUDENT);

    const bookingIds = dto.bookingIds;

    // Retrieve requested bookings
    const bookings = await this.prisma.client.booking.findMany({
      where: {
        id: { in: bookingIds },
      },
      include: {
        participants: {
          select: { studentId: true },
        },
      },
    });

    if (bookings.length !== bookingIds.length) {
      throw new NotFoundException('One or more booking slots not found');
    }

    // Validation checks
    for (const booking of bookings) {
      const alreadyJoined = booking.participants.some(
        (p) => p.studentId === studentId,
      );
      if (alreadyJoined) {
        throw new BadRequestException(
          `You are already booked for slot ${booking.id}`,
        );
      }
      if (booking.status === BookingStatus.CANCELLED) {
        throw new BadRequestException(
          `Booking slot ${booking.id} is cancelled`,
        );
      }
      if (booking.scheduledAt && booking.scheduledAt <= new Date()) {
        throw new BadRequestException(
          `Booking slot ${booking.id} is in the past`,
        );
      }
    }

    const requiredCredits = bookings.length;
    const batchGroupBookingId = randomUUID();

    const result = await this.prisma.client.$transaction(async (tx) => {
      const creditBalance = await tx.studentCreditBalance.findUnique({
        where: { studentId },
        select: { totalCredits: true },
      });

      if (!creditBalance || creditBalance.totalCredits < requiredCredits) {
        throw new BadRequestException(
          `Not enough credits. Required: ${requiredCredits}, Available: ${creditBalance?.totalCredits || 0}`,
        );
      }

      // Deduct credits
      await tx.studentCreditBalance.updateMany({
        where: {
          studentId,
          totalCredits: { gte: requiredCredits },
        },
        data: {
          totalCredits: { decrement: requiredCredits },
        },
      });

      // Update all bookings
      const updatedBookings = [];
      for (const booking of bookings) {
        const updated = await tx.booking.update({
          where: { id: booking.id },
          data: {
            studentId: booking.studentId || studentId,
            status: BookingStatus.SCHEDULED,
            creditCost: 1,
            creditDeductedAt: new Date(),
            isPackage: true,
            groupBookingId: batchGroupBookingId,
            participants: {
              create: { studentId },
            },
          },
          include: this.bookingInclude,
        });
        updatedBookings.push(updated);
      }

      return updatedBookings;
    });

    // Send confirmations
    for (const b of result) {
      await this.notificationService.createMany([studentId], {
        type: 'BOOKING_SCHEDULED',
        title: 'Booking confirmed',
        message: `Your booking for ${b.topic || 'Class'} is confirmed.`,
        data: {
          bookingId: b.id,
          scheduledAt: b.scheduledAt?.toISOString() ?? null,
        },
      });
      await this.syncGoogleCalendar(b.id);
    }

    return {
      message: `Successfully booked ${result.length} sessions.`,
      data: result,
    };
  }

  async createTutorAvailability(
    tutorId: string,
    dto: TutorCreateAvailabilityDto,
  ) {
    await this.ensureUserRole(tutorId, UserRole.TUTOR);

    const created = [];
    for (const slot of dto.slots) {
      const scheduledAt = new Date(slot.scheduledAt);
      const durationMinutes = slot.durationMinutes ?? 50;

      const dbSlot = await this.prisma.client.tutorAvailability.create({
        data: {
          tutorId,
          scheduledAt,
          durationMinutes,
        },
      });
      created.push(dbSlot);
    }

    return {
      message: 'Availability slots created successfully',
      data: created,
    };
  }

  async getTutorAvailabilities(tutorId: string) {
    await this.ensureUserRole(tutorId, UserRole.TUTOR);
    const slots = await this.prisma.client.tutorAvailability.findMany({
      where: { tutorId },
      orderBy: { scheduledAt: 'asc' },
    });

    const now = new Date();
    const outdatedIds: string[] = [];
    const filtered = slots.filter((slot) => {
      const isOutdated = slot.scheduledAt < now && !slot.isBooked;
      if (isOutdated) {
        outdatedIds.push(slot.id);
        return false;
      }
      return true;
    });

    if (outdatedIds.length > 0) {
      this.prisma.client.tutorAvailability
        .deleteMany({
          where: { id: { in: outdatedIds } },
        })
        .catch((err) => {
          this.logger.error(
            `Failed to asynchronously delete outdated slots for tutor ${tutorId}: ${err.message}`,
            err.stack,
          );
        });
    }

    return { data: filtered };
  }

  async deleteTutorAvailability(tutorId: string, id: string) {
    await this.ensureUserRole(tutorId, UserRole.TUTOR);
    const slot = await this.prisma.client.tutorAvailability.findFirst({
      where: { id, tutorId },
    });
    if (!slot) {
      throw new NotFoundException('Availability slot not found');
    }
    if (slot.isBooked) {
      throw new BadRequestException('Cannot delete a booked availability slot');
    }
    await this.prisma.client.tutorAvailability.delete({
      where: { id },
    });
    return {
      message: 'Availability slot deleted successfully',
    };
  }

  async getAvailableSlotsForStudent(tutorId: string) {
    const slots = await this.prisma.client.tutorAvailability.findMany({
      where: {
        tutorId,
        isBooked: false,
      },
      orderBy: { scheduledAt: 'asc' },
    });

    const now = new Date();
    const outdatedIds: string[] = [];
    const filtered = [];

    for (const slot of slots) {
      if (slot.scheduledAt < now) {
        outdatedIds.push(slot.id);
        continue;
      }

      const overlap = await this.checkOverlap(
        tutorId,
        slot.scheduledAt,
        slot.durationMinutes,
      );
      if (!overlap) {
        filtered.push({
          id: slot.id,
          tutorId: slot.tutorId,
          scheduledAt: slot.scheduledAt,
          durationMinutes: slot.durationMinutes,
        });
      }
    }

    if (outdatedIds.length > 0) {
      this.prisma.client.tutorAvailability
        .deleteMany({
          where: { id: { in: outdatedIds } },
        })
        .catch((err) => {
          this.logger.error(
            `Failed to asynchronously delete outdated student slots for tutor ${tutorId}: ${err.message}`,
            err.stack,
          );
        });
    }

    return { data: filtered };
  }

  private getTutorSearchWindow(dateFrom?: string, dateTo?: string) {
    const now = new Date();
    const from = dateFrom ? new Date(dateFrom) : now;
    const to = dateTo
      ? new Date(dateTo)
      : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    return {
      from: from < now ? now : from,
      to,
    };
  }

  private tutorSupportsLessonType(
    tutorRoles: TutorSubRole[],
    lessonType?: LessonType,
  ) {
    if (!lessonType || lessonType === LessonType.BOTH) {
      return true;
    }

    if (lessonType === LessonType.REGULAR) {
      return tutorRoles.includes(TutorSubRole.REGULAR);
    }

    if (lessonType === LessonType.CONVERSATION) {
      return tutorRoles.includes(TutorSubRole.CONVERSATION);
    }

    return true;
  }

  private getTutorMatchScore(
    tutor: { name: string | null },
    bookings: Array<{ topic: string | null; note: string | null; tags: string[] }>,
    search?: string,
  ) {
    if (!search?.trim()) {
      return {
        score: 0,
        matchedFields: [] as string[],
      };
    }

    const needle = search.trim().toLowerCase();
    const matchedFields = new Set<string>();
    let score = 0;
    const tutorName = tutor.name?.toLowerCase() ?? '';

    if (tutorName === needle) {
      score += 100;
      matchedFields.add('teacherName');
    } else if (tutorName.includes(needle)) {
      score += 75;
      matchedFields.add('teacherName');
    }

    for (const booking of bookings) {
      if (booking.topic?.toLowerCase().includes(needle)) {
        score += 45;
        matchedFields.add('title');
      }
      if (booking.tags.some((tag) => tag.toLowerCase().includes(needle))) {
        score += 35;
        matchedFields.add('tag');
      }
      if (booking.note?.toLowerCase().includes(needle)) {
        score += 20;
        matchedFields.add('description');
      }
    }

    return {
      score,
      matchedFields: Array.from(matchedFields),
    };
  }

  private compareNullableDates(
    first: Date | null,
    second: Date | null,
    sortOrder: SortOrder = SortOrder.ASC,
  ) {
    if (!first && !second) return 0;
    if (!first) return 1;
    if (!second) return -1;
    const diff = first.getTime() - second.getTime();
    return sortOrder === SortOrder.DESC ? -diff : diff;
  }

  async searchTutorsForStudent(query: StudentTutorSearchQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const sortBy =
      query.sortBy ??
      (query.search ? StudentTutorSortBy.RELEVANCE : StudentTutorSortBy.NEXT_AVAILABLE);
    const sortOrder =
      query.sortOrder ??
      (sortBy === StudentTutorSortBy.NEWEST ? SortOrder.DESC : SortOrder.ASC);
    const { from, to } = this.getTutorSearchWindow(query.dateFrom, query.dateTo);

    const tutorWhere: Prisma.UserWhereInput = {
      role: UserRole.TUTOR,
      status: UserStatus.ACTIVE,
    };

    const tutors = await this.prisma.client.user.findMany({
      where: tutorWhere,
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        tutorRoles: true,
        timeZone: true,
        createdAt: true,
      },
    });

    const tutorIds = tutors
      .filter((tutor) =>
        this.tutorSupportsLessonType(tutor.tutorRoles, query.lessonType),
      )
      .map((tutor) => tutor.id);

    if (tutorIds.length === 0) {
      return {
        message: 'Tutors fetched successfully',
        data: [],
        meta: { total: 0, page, limit, totalPages: 0 },
      };
    }

    const bookingLessonType =
      query.lessonType && query.lessonType !== LessonType.BOTH
        ? query.lessonType
        : undefined;

    const [availabilities, availableBookings] = await Promise.all([
      this.prisma.client.tutorAvailability.findMany({
        where: {
          tutorId: { in: tutorIds },
          isBooked: false,
          scheduledAt: {
            gte: from,
            lte: to,
          },
        },
        orderBy: { scheduledAt: 'asc' },
      }),
      this.prisma.client.booking.findMany({
        where: {
          tutorId: { in: tutorIds },
          studentId: null,
          status: BookingStatus.SCHEDULED,
          scheduledAt: {
            gte: from,
            lte: to,
          },
          lessonType: bookingLessonType,
        },
        select: {
          id: true,
          tutorId: true,
          topic: true,
          note: true,
          tags: true,
          scheduledAt: true,
          durationMinutes: true,
          lessonType: true,
        },
        orderBy: { scheduledAt: 'asc' },
      }),
    ]);

    const availabilityByTutor = new Map<string, typeof availabilities>();
    for (const availability of availabilities) {
      const group = availabilityByTutor.get(availability.tutorId) ?? [];
      group.push(availability);
      availabilityByTutor.set(availability.tutorId, group);
    }

    const bookingByTutor = new Map<string, typeof availableBookings>();
    for (const booking of availableBookings) {
      if (!booking.tutorId) continue;
      const group = bookingByTutor.get(booking.tutorId) ?? [];
      group.push(booking);
      bookingByTutor.set(booking.tutorId, group);
    }

    const cards = tutors
      .filter((tutor) => tutorIds.includes(tutor.id))
      .map((tutor) => {
        const tutorAvailabilities = availabilityByTutor.get(tutor.id) ?? [];
        const tutorBookings = bookingByTutor.get(tutor.id) ?? [];
        const allTimes = [
          ...tutorAvailabilities.map((slot) => slot.scheduledAt),
          ...tutorBookings
            .map((booking) => booking.scheduledAt)
            .filter((date): date is Date => !!date),
        ].sort((a, b) => a.getTime() - b.getTime());
        const match = this.getTutorMatchScore(tutor, tutorBookings, query.search);

        return {
          id: tutor.id,
          name: tutor.name,
          avatarUrl: tutor.avatarUrl,
          tutorRoles: tutor.tutorRoles,
          timeZone: tutor.timeZone,
          nextAvailableSlot: allTimes[0] ?? null,
          availableSlotCount: tutorAvailabilities.length + tutorBookings.length,
          matchedFields: match.matchedFields,
          relevanceScore: match.score,
          createdAt: tutor.createdAt,
        };
      })
      .filter((card) => {
        if (query.hasAvailability && card.availableSlotCount === 0) {
          return false;
        }
        if (query.search?.trim() && card.relevanceScore === 0) {
          return false;
        }
        return true;
      });

    cards.sort((first, second) => {
      if (sortBy === StudentTutorSortBy.RELEVANCE) {
        const relevanceDiff = second.relevanceScore - first.relevanceScore;
        if (relevanceDiff !== 0) return relevanceDiff;
        return this.compareNullableDates(first.nextAvailableSlot, second.nextAvailableSlot);
      }

      if (sortBy === StudentTutorSortBy.NEWEST) {
        const diff = first.createdAt.getTime() - second.createdAt.getTime();
        return sortOrder === SortOrder.DESC ? -diff : diff;
      }

      return this.compareNullableDates(
        first.nextAvailableSlot,
        second.nextAvailableSlot,
        sortOrder,
      );
    });

    const total = cards.length;
    const skip = (page - 1) * limit;
    const data = cards.slice(skip, skip + limit).map(({ relevanceScore, createdAt, ...card }) => card);

    return {
      message: 'Tutors fetched successfully',
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getTutorScheduleForStudent(
    tutorId: string,
    query: StudentTutorScheduleQueryDto,
  ) {
    const tutor = await this.prisma.client.user.findFirst({
      where: {
        id: tutorId,
        role: UserRole.TUTOR,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        tutorRoles: true,
        timeZone: true,
      },
    });

    if (!tutor) {
      throw new NotFoundException('Tutor not found');
    }

    const { from, to } = this.getTutorSearchWindow(query.dateFrom, query.dateTo);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;
    const bookingLessonType =
      query.lessonType && query.lessonType !== LessonType.BOTH
        ? query.lessonType
        : undefined;

    const [availabilities, scheduledClasses, scheduledTotal] =
      await Promise.all([
        this.prisma.client.tutorAvailability.findMany({
          where: {
            tutorId,
            isBooked: false,
            scheduledAt: {
              gte: from,
              lte: to,
            },
          },
          orderBy: { scheduledAt: 'asc' },
        }),
        this.prisma.client.booking.findMany({
          where: {
            tutorId,
            scheduledAt: {
              gte: from,
              lte: to,
            },
            lessonType: bookingLessonType,
            status: {
              in: [
                BookingStatus.SCHEDULED,
                BookingStatus.COMPLETED,
                BookingStatus.CANCELLED,
              ],
            },
          },
          select: {
            id: true,
            scheduledAt: true,
            durationMinutes: true,
            lessonType: true,
            status: true,
            liveClassStatus: true,
          },
          orderBy: { scheduledAt: 'asc' },
          skip,
          take: limit,
        }),
        this.prisma.client.booking.count({
          where: {
            tutorId,
            scheduledAt: {
              gte: from,
              lte: to,
            },
            lessonType: bookingLessonType,
            status: {
              in: [
                BookingStatus.SCHEDULED,
                BookingStatus.COMPLETED,
                BookingStatus.CANCELLED,
              ],
            },
          },
        }),
      ]);

    return {
      message: 'Tutor schedule fetched successfully',
      data: {
        tutor,
        availabilities: availabilities.map((slot) => ({
          id: slot.id,
          tutorId: slot.tutorId,
          scheduledAt: slot.scheduledAt,
          durationMinutes: slot.durationMinutes,
          isBookable: true,
          status: 'AVAILABLE',
        })),
        scheduledClasses: scheduledClasses.map((booking) => ({
          id: booking.id,
          scheduledAt: booking.scheduledAt,
          durationMinutes: booking.durationMinutes,
          lessonType: booking.lessonType,
          status: booking.status,
          liveClassStatus: booking.liveClassStatus,
          isBookable: false,
        })),
      },
      meta: {
        total: scheduledTotal,
        page,
        limit,
        totalPages: Math.ceil(scheduledTotal / limit),
      },
    };
  }

  async studentBookAvailability(
    studentId: string,
    availabilityId: string,
    dto: StudentBookAvailabilityDto,
  ) {
    await this.ensureUserRole(studentId, UserRole.STUDENT);

    const bookingResult = await this.prisma.client.$transaction(async (tx) => {
      const slot = await tx.tutorAvailability.findUnique({
        where: { id: availabilityId },
        include: {
          tutor: true,
        },
      });

      if (!slot) {
        throw new NotFoundException('Availability slot not found');
      }

      if (slot.isBooked) {
        throw new ConflictException('Availability slot is already booked');
      }

      if (slot.scheduledAt <= new Date()) {
        throw new BadRequestException('Cannot book a slot in the past');
      }

      // Dynamic overlap check
      const overlap = await this.checkOverlap(
        slot.tutorId,
        slot.scheduledAt,
        slot.durationMinutes,
        undefined,
        tx,
      );
      if (overlap) {
        throw new ConflictException({
          message: 'This slot overlaps with another scheduled class',
          conflictType: overlap.conflictType,
          conflict: overlap.conflict,
        });
      }

      // Check tutor sub-roles
      const roles = slot.tutor.tutorRoles || [];
      let finalLessonType: LessonType;

      const hasRegular = roles.includes(TutorSubRole.REGULAR);
      const hasConversation = roles.includes(TutorSubRole.CONVERSATION);

      if (!hasRegular && !hasConversation) {
        throw new ForbiddenException(
          'Tutor does not have lesson teaching roles configured',
        );
      }

      if (hasRegular && !hasConversation) {
        finalLessonType = LessonType.REGULAR;
      } else if (!hasRegular && hasConversation) {
        finalLessonType = LessonType.CONVERSATION;
      } else {
        // Has both roles
        if (!dto.lessonType) {
          throw new BadRequestException(
            'lessonType is required when tutor has both regular and conversation roles',
          );
        }
        if (dto.lessonType === LessonType.BOTH) {
          throw new BadRequestException(
            'Cannot book BOTH as a single lesson type',
          );
        }
        finalLessonType = dto.lessonType;
      }

      // Check credit balance
      const creditBalance = await tx.studentCreditBalance.findUnique({
        where: { studentId },
      });
      if (!creditBalance || creditBalance.totalCredits < 1) {
        throw new BadRequestException('Student does not have enough credit');
      }

      // Deduct credit
      await tx.studentCreditBalance.update({
        where: { studentId },
        data: {
          totalCredits: { decrement: 1 },
        },
      });

      const bookingId = randomUUID();

      // Create Booking
      const booking = await tx.booking.create({
        data: {
          id: bookingId,
          studentId,
          tutorId: slot.tutorId,
          createdBy: BookingCreatedBy.STUDENT,
          status: BookingStatus.SCHEDULED,
          liveClassStatus: LiveClassStatus.SCHEDULED,
          topic: `${slot.tutor.name || 'Tutor'}'s Availability Lesson`,
          note: '',
          tags: [],
          scheduledAt: slot.scheduledAt,
          durationMinutes: slot.durationMinutes,
          isPackage: false,
          lessonType: finalLessonType,
          creditCost: 1,
          creditDeductedAt: new Date(),
          participants: {
            create: {
              studentId,
            },
          },
        },
      });

      // Link availability
      await tx.tutorAvailability.update({
        where: { id: availabilityId },
        data: {
          isBooked: true,
          bookingId,
        },
      });

      return (
        booking ??
        (await tx.booking.findUnique({
          where: { id: bookingId },
        }))
      );
    });

    if (!bookingResult) {
      throw new BadRequestException('Booking could not be created');
    }

    // Send confirmation notification
    await this.notificationService.createMany([studentId], {
      type: 'BOOKING_SCHEDULED',
      title: 'Booking confirmed',
      message: `Your booking for ${bookingResult.topic || 'Class'} is confirmed.`,
      data: {
        bookingId: bookingResult.id,
        scheduledAt: bookingResult.scheduledAt?.toISOString() ?? null,
      },
    });

    await this.syncGoogleCalendar(bookingResult.id);

    return {
      message: 'Booking confirmed successfully',
      data: {
        bookingId: bookingResult.id,
        studentIds: [studentId],
        scheduledAt: bookingResult.scheduledAt,
        status: bookingResult.status,
        lessonType: bookingResult.lessonType,
        creditDeducted: 1,
      },
    };
  }

  async generateTutorAvailability(
    tutorId: string,
    dto: TutorGenerateAvailabilityDto,
  ) {
    await this.ensureUserRole(tutorId, UserRole.TUTOR);

    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    const durationMinutes = dto.durationMinutes ?? 50;

    const [startH, startM] = dto.startTime.split(':').map(Number);
    const [endH, endM] = dto.endTime.split(':').map(Number);

    const created = [];
    const current = new Date(start);
    current.setHours(0, 0, 0, 0);

    while (current <= end) {
      const day = current.getDay();
      if (dto.dayOfWeek.includes(day)) {
        let currentHour = startH;
        while (currentHour < endH) {
          const slotTime = new Date(current);
          slotTime.setHours(currentHour, startM, 0, 0);

          const dbSlot = await this.prisma.client.tutorAvailability.create({
            data: {
              tutorId,
              scheduledAt: slotTime,
              durationMinutes,
            },
          });
          created.push(dbSlot);

          currentHour++;
        }
      }
      current.setDate(current.getDate() + 1);
    }

    return {
      message: `Availability slots generated successfully. Created ${created.length} slots.`,
      data: created,
    };
  }
}
