import { BookingService } from './booking.service';
import {
  BookingStatus,
  LessonType,
  LiveClassStatus,
  TutorSubRole,
  UserRole,
  UserStatus,
} from '@prisma/client';

describe('BookingService', () => {
  const createService = () => {
    const prisma = {
      client: {
        user: {
          findUnique: jest.fn(),
          findMany: jest.fn(),
          findFirst: jest.fn(),
        },
        tutorRecurringSchedule: {
          findUnique: jest.fn(),
        },
        booking: {
          findMany: jest.fn(),
          findUnique: jest.fn(),
          update: jest.fn(),
          create: jest.fn(),
          count: jest.fn(),
        },
        bookingParticipant: {
          findFirst: jest.fn(),
        },
        tutorAvailability: {
          findMany: jest.fn(),
          findUnique: jest.fn(),
          update: jest.fn(),
        },
        studentCreditBalance: {
          findUnique: jest.fn(),
          updateMany: jest.fn(),
          update: jest.fn(),
        },
        $transaction: jest.fn(),
      },
    };

    const notificationService = {
      createMany: jest.fn(),
    };
    const mediaRoomManager = {};
    const googleCalendarService = {
      syncBooking: jest.fn().mockResolvedValue(undefined),
    };

    const service = new BookingService(
      prisma as any,
      notificationService as any,
      mediaRoomManager as any,
      googleCalendarService as any,
    );

    return { service, prisma, notificationService, googleCalendarService };
  };

  it('books only the next recurring package occurrence group', async () => {
    const { service, prisma, notificationService, googleCalendarService } =
      createService();
    const schedule = { id: 'schedule-1' };
    const now = new Date('2026-07-07T00:00:00.000Z');
    const sessions = [
      {
        id: 'b1',
        recurringScheduleId: schedule.id,
        groupBookingId: 'group-1',
        scheduledAt: new Date('2026-07-08T10:00:00.000Z'),
        studentId: null,
      },
      {
        id: 'b2',
        recurringScheduleId: schedule.id,
        groupBookingId: 'group-1',
        scheduledAt: new Date('2026-07-08T11:00:00.000Z'),
        studentId: null,
      },
      {
        id: 'b3',
        recurringScheduleId: schedule.id,
        groupBookingId: 'group-2',
        scheduledAt: new Date('2026-07-15T10:00:00.000Z'),
        studentId: null,
      },
    ];

    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
    jest.spyOn(service as any, 'ensureUserRole').mockResolvedValue({});

    prisma.client.tutorRecurringSchedule.findUnique.mockResolvedValue(schedule);
    prisma.client.booking.findMany.mockResolvedValue(sessions);
    prisma.client.studentCreditBalance.findUnique.mockResolvedValue({
      totalCredits: 10,
    });
    prisma.client.studentCreditBalance.updateMany.mockResolvedValue({
      count: 2,
    });
    prisma.client.booking.update.mockImplementation(async ({ where, data }) => ({
      id: where.id,
      ...data,
    }));
    prisma.client.$transaction.mockImplementation(async (callback) =>
      callback(prisma.client),
    );
    notificationService.createMany.mockResolvedValue(undefined);

    const result = await service.studentBookPackage('student-1', schedule.id);

    expect(prisma.client.booking.update).toHaveBeenCalledTimes(2);
    expect(prisma.client.booking.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'b1' },
      }),
    );
    expect(prisma.client.booking.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 'b2' },
      }),
    );
    expect(prisma.client.booking.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'b3' },
      }),
    );
    expect(googleCalendarService.syncBooking).toHaveBeenCalledTimes(2);
    expect(googleCalendarService.syncBooking).toHaveBeenCalledWith('b1');
    expect(googleCalendarService.syncBooking).toHaveBeenCalledWith('b2');
    expect(result.message).toBe('Package booked successfully. Confirmed 2 sessions.');
  });

  it('books a batch of slots into a visible grouped package', async () => {
    const { service, prisma, notificationService, googleCalendarService } =
      createService();
    jest.spyOn(Date, 'now').mockReturnValue(
      new Date('2026-07-07T00:00:00.000Z').getTime(),
    );
    jest.spyOn(service as any, 'ensureUserRole').mockResolvedValue({});

    const bookings = [
      {
        id: 'booking-1',
        studentId: null,
        status: BookingStatus.SCHEDULED,
        scheduledAt: new Date('2026-07-08T10:00:00.000Z'),
        participants: [],
      },
      {
        id: 'booking-2',
        studentId: null,
        status: BookingStatus.SCHEDULED,
        scheduledAt: new Date('2026-07-08T11:00:00.000Z'),
        participants: [],
      },
    ];

    prisma.client.booking.findMany.mockResolvedValue(bookings);
    prisma.client.studentCreditBalance.findUnique.mockResolvedValue({
      totalCredits: 10,
    });
    prisma.client.studentCreditBalance.updateMany.mockResolvedValue({
      count: 2,
    });
    prisma.client.booking.update.mockImplementation(async ({ where, data }) => ({
      id: where.id,
      ...data,
    }));
    prisma.client.$transaction.mockImplementation(async (callback) =>
      callback(prisma.client),
    );
    notificationService.createMany.mockResolvedValue(undefined);

    const result = await service.studentBookBatch('student-1', {
      bookingIds: ['booking-1', 'booking-2'],
    });

    expect(prisma.client.booking.update).toHaveBeenCalledTimes(2);
    expect(prisma.client.booking.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'booking-1' },
        data: expect.objectContaining({
          studentId: 'student-1',
          isPackage: true,
          groupBookingId: expect.any(String),
        }),
      }),
    );
    expect(prisma.client.booking.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 'booking-2' },
        data: expect.objectContaining({
          studentId: 'student-1',
          isPackage: true,
          groupBookingId: expect.any(String),
        }),
      }),
    );
    expect(googleCalendarService.syncBooking).toHaveBeenCalledTimes(2);
    expect(googleCalendarService.syncBooking).toHaveBeenCalledWith('booking-1');
    expect(googleCalendarService.syncBooking).toHaveBeenCalledWith('booking-2');
    expect(result.message).toBe(
      'Successfully booked 2 sessions.',
    );
  });

  it('syncs Google Calendar after booking a single slot', async () => {
    const { service, prisma, notificationService, googleCalendarService } =
      createService();
    jest.spyOn(service as any, 'ensureUserRole').mockResolvedValue({});
    jest.spyOn(service as any, 'ensureStudentHasCredit').mockResolvedValue({});
    jest.spyOn(service as any, 'deductStudentCredit').mockResolvedValue({});

    const scheduledAt = new Date('2026-07-08T10:00:00.000Z');
    prisma.client.booking.findUnique.mockResolvedValue({
      id: 'booking-1',
      studentId: null,
      status: BookingStatus.SCHEDULED,
      scheduledAt,
      isPackage: false,
    });
    prisma.client.bookingParticipant.findFirst.mockResolvedValue(null);
    prisma.client.booking.update.mockResolvedValue({
      id: 'booking-1',
      topic: 'Math Class',
      scheduledAt,
    });
    prisma.client.$transaction.mockImplementation(async (callback) =>
      callback(prisma.client),
    );
    notificationService.createMany.mockResolvedValue(undefined);

    await service.studentBookSlot('student-1', 'booking-1');

    expect(googleCalendarService.syncBooking).toHaveBeenCalledWith('booking-1');
  });

  it('searches tutors by best matching teacher and booking fields', async () => {
    const { service, prisma } = createService();

    prisma.client.user.findMany.mockResolvedValue([
      {
        id: 'tutor-name',
        name: 'Physics Mentor',
        avatarUrl: null,
        tutorRoles: [TutorSubRole.REGULAR],
        timeZone: 'UTC',
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
      },
      {
        id: 'tutor-topic',
        name: 'Science Coach',
        avatarUrl: null,
        tutorRoles: [TutorSubRole.REGULAR],
        timeZone: 'UTC',
        createdAt: new Date('2026-07-02T00:00:00.000Z'),
      },
    ]);
    prisma.client.tutorAvailability.findMany.mockResolvedValue([
      {
        id: 'availability-1',
        tutorId: 'tutor-name',
        scheduledAt: new Date('2026-07-08T10:00:00.000Z'),
      },
      {
        id: 'availability-2',
        tutorId: 'tutor-topic',
        scheduledAt: new Date('2026-07-08T09:00:00.000Z'),
      },
    ]);
    prisma.client.booking.findMany.mockResolvedValue([
      {
        id: 'booking-1',
        tutorId: 'tutor-topic',
        topic: 'Physics Review',
        note: 'Forces and acceleration',
        tags: ['mechanics'],
        scheduledAt: new Date('2026-07-08T09:00:00.000Z'),
        durationMinutes: 50,
        lessonType: LessonType.REGULAR,
      },
    ]);

    const result = await service.searchTutorsForStudent({
      search: 'physics',
      page: 1,
      limit: 10,
    });

    expect(result.data).toHaveLength(2);
    expect(result.data[0].id).toBe('tutor-name');
    expect(result.data[0].matchedFields).toContain('teacherName');
    expect(result.data[1].matchedFields).toContain('title');
    expect(result.meta.total).toBe(2);
  });

  it('returns tutor schedule without private student data', async () => {
    const { service, prisma } = createService();

    prisma.client.user.findFirst.mockResolvedValue({
      id: 'tutor-1',
      name: 'Tutor',
      avatarUrl: null,
      tutorRoles: [TutorSubRole.REGULAR],
      timeZone: 'UTC',
    });
    prisma.client.tutorAvailability.findMany.mockResolvedValue([
      {
        id: 'availability-1',
        tutorId: 'tutor-1',
        scheduledAt: new Date('2026-07-08T10:00:00.000Z'),
        durationMinutes: 50,
      },
    ]);
    prisma.client.booking.findMany.mockResolvedValue([
      {
        id: 'booking-1',
        scheduledAt: new Date('2026-07-08T11:00:00.000Z'),
        durationMinutes: 50,
        lessonType: LessonType.REGULAR,
        status: BookingStatus.SCHEDULED,
        liveClassStatus: LiveClassStatus.SCHEDULED,
      },
    ]);
    prisma.client.booking.count.mockResolvedValue(1);

    const result = await service.getTutorScheduleForStudent('tutor-1', {});

    expect(result.data.tutor).toEqual(
      expect.objectContaining({
        id: 'tutor-1',
        name: 'Tutor',
      }),
    );
    expect(result.data.availabilities[0]).toEqual(
      expect.objectContaining({
        id: 'availability-1',
        isBookable: true,
        status: 'AVAILABLE',
      }),
    );
    expect(result.data.scheduledClasses[0]).toEqual(
      expect.objectContaining({
        id: 'booking-1',
        isBookable: false,
        status: BookingStatus.SCHEDULED,
      }),
    );
    expect(result.data.scheduledClasses[0]).not.toHaveProperty('student');
    expect(result.data.scheduledClasses[0]).not.toHaveProperty('participants');
    expect(result.meta.total).toBe(1);
  });

  it('syncs Google Calendar after booking an availability slot', async () => {
    const { service, prisma, notificationService, googleCalendarService } =
      createService();
    jest.spyOn(service as any, 'ensureUserRole').mockResolvedValue({});
    jest.spyOn(service as any, 'checkOverlap').mockResolvedValue(null);

    prisma.client.tutorAvailability.findUnique.mockResolvedValue({
      id: 'availability-1',
      tutorId: 'tutor-1',
      scheduledAt: new Date('2026-07-08T10:00:00.000Z'),
      durationMinutes: 50,
      isBooked: false,
      tutor: {
        name: 'Tutor',
        tutorRoles: [TutorSubRole.REGULAR],
      },
    });
    prisma.client.studentCreditBalance.findUnique.mockResolvedValue({
      totalCredits: 1,
    });
    prisma.client.studentCreditBalance.update.mockResolvedValue({
      totalCredits: 0,
    });
    prisma.client.booking.create.mockResolvedValue({
      id: 'booking-availability-1',
      topic: 'Availability Lesson',
      scheduledAt: new Date('2026-07-08T10:00:00.000Z'),
      status: BookingStatus.SCHEDULED,
      lessonType: LessonType.REGULAR,
    });
    prisma.client.tutorAvailability.update.mockResolvedValue({});
    prisma.client.$transaction.mockImplementation(async (callback) =>
      callback(prisma.client),
    );
    notificationService.createMany.mockResolvedValue(undefined);

    await service.studentBookAvailability('student-1', 'availability-1', {});

    expect(googleCalendarService.syncBooking).toHaveBeenCalledWith(
      'booking-availability-1',
    );
  });

  it('does not crash if Prisma create returns null while booking an availability slot', async () => {
    const { service, prisma, notificationService, googleCalendarService } =
      createService();
    const scheduledAt = new Date('2026-07-08T10:00:00.000Z');

    jest.spyOn(service as any, 'ensureUserRole').mockResolvedValue({});
    jest.spyOn(service as any, 'checkOverlap').mockResolvedValue(null);

    prisma.client.tutorAvailability.findUnique.mockResolvedValue({
      id: 'availability-1',
      tutorId: 'tutor-1',
      scheduledAt,
      durationMinutes: 50,
      isBooked: false,
      tutor: {
        name: 'Tutor',
        tutorRoles: [TutorSubRole.REGULAR],
      },
    });
    prisma.client.studentCreditBalance.findUnique.mockResolvedValue({
      totalCredits: 1,
    });
    prisma.client.studentCreditBalance.update.mockResolvedValue({
      totalCredits: 0,
    });
    prisma.client.booking.create.mockResolvedValue(null);
    prisma.client.booking.findUnique.mockResolvedValue({
      id: 'booking-availability-1',
      topic: 'Availability Lesson',
      scheduledAt,
      status: BookingStatus.SCHEDULED,
      lessonType: LessonType.REGULAR,
    });
    prisma.client.tutorAvailability.update.mockResolvedValue({});
    prisma.client.$transaction.mockImplementation(async (callback) =>
      callback(prisma.client),
    );
    notificationService.createMany.mockResolvedValue(undefined);

    await service.studentBookAvailability('student-1', 'availability-1', {});

    expect(prisma.client.tutorAvailability.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bookingId: expect.any(String),
        }),
      }),
    );
    expect(googleCalendarService.syncBooking).toHaveBeenCalledWith(
      'booking-availability-1',
    );
  });
});
