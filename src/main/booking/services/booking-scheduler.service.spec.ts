import {
  BookingCreatedBy,
  BookingStatus,
  LessonType,
  LiveClassStatus,
  RecurringFrequency,
  TutorBookingType,
} from '@prisma/client';
import { BookingSchedulerService } from './booking-scheduler.service';

describe('BookingSchedulerService', () => {
  const makeSchedule = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'schedule-1',
      tutorId: 'tutor-1',
      studentId: null,
      title: 'Weekly Lesson',
      description: 'Recurring notes',
      tags: ['grammar'],
      frequency: RecurringFrequency.WEEKLY,
      dayOfWeek: [3],
      dayOfMonth: null,
      timeOfDay: '10:00',
      startDate: new Date('2026-07-08T10:00:00.000Z'),
      endDate: null,
      durationHours: 1,
      isPackage: true,
      openingWindowDays: 14,
      isActive: true,
      lastGeneratedUpTo: null,
      occurrencesConfig: null,
      blockedDateRanges: null,
      lessonType: LessonType.REGULAR,
      createdAt: new Date('2026-07-07T00:00:00.000Z'),
      updatedAt: new Date('2026-07-07T00:00:00.000Z'),
      ...overrides,
    }) as any;

  const createService = () => {
    const prisma = {
      client: {
        tutorRecurringSchedule: {
          findMany: jest.fn(),
          update: jest.fn(),
        },
        booking: {
          findFirst: jest.fn(),
          create: jest.fn(),
        },
      },
    };
    const bookingService = {
      checkOverlap: jest.fn(),
    };
    const tutorScheduleService = {
      getNextOccurrence: jest.fn(),
    };

    const service = new BookingSchedulerService(
      prisma as any,
      bookingService as any,
      tutorScheduleService as any,
    );

    return {
      service,
      prisma,
      bookingService,
      tutorScheduleService,
    };
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-07T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates weekly recurring bookings inside the opening window immediately', async () => {
    const { service, prisma, bookingService, tutorScheduleService } =
      createService();
    const schedule = makeSchedule();
    const firstOccurrence = new Date('2026-07-08T10:00:00.000Z');
    const secondOccurrence = new Date('2026-07-15T10:00:00.000Z');
    const outsideWindow = new Date('2026-07-22T10:00:00.000Z');

    tutorScheduleService.getNextOccurrence
      .mockReturnValueOnce(firstOccurrence)
      .mockReturnValueOnce(secondOccurrence)
      .mockReturnValueOnce(outsideWindow);
    prisma.client.booking.findFirst.mockResolvedValue(null);
    prisma.client.booking.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: `booking-${data.scheduledAt.toISOString()}` }),
    );
    prisma.client.tutorRecurringSchedule.update.mockResolvedValue(schedule);
    bookingService.checkOverlap.mockResolvedValue(null);

    await service.generateBookingsForSchedule(schedule);

    expect(prisma.client.booking.create).toHaveBeenCalledTimes(2);
    expect(prisma.client.booking.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        recurringScheduleId: schedule.id,
        tutorBookingType: TutorBookingType.RECURRING,
        status: BookingStatus.SCHEDULED,
        liveClassStatus: LiveClassStatus.SCHEDULED,
        durationMinutes: 50,
        scheduledAt: firstOccurrence,
        tutorId: schedule.tutorId,
        createdBy: BookingCreatedBy.TUTOR,
        isPackage: true,
        lessonType: LessonType.REGULAR,
      }),
    });
    expect(prisma.client.booking.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        recurringScheduleId: schedule.id,
        scheduledAt: secondOccurrence,
      }),
    });
    expect(bookingService.checkOverlap).toHaveBeenCalledWith(
      schedule.tutorId,
      firstOccurrence,
      50,
      schedule.id,
    );
  });

  it('creates one 50-minute booking per hour segment for multi-hour schedules', async () => {
    const { service, prisma, bookingService, tutorScheduleService } =
      createService();
    const schedule = makeSchedule({ durationHours: 3 });
    const occurrence = new Date('2026-07-08T10:00:00.000Z');
    const outsideWindow = new Date('2026-07-22T10:00:00.000Z');

    tutorScheduleService.getNextOccurrence
      .mockReturnValueOnce(occurrence)
      .mockReturnValueOnce(outsideWindow);
    prisma.client.booking.findFirst.mockResolvedValue(null);
    prisma.client.booking.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: `booking-${data.topic}` }),
    );
    prisma.client.tutorRecurringSchedule.update.mockResolvedValue(schedule);
    bookingService.checkOverlap.mockResolvedValue(null);

    await service.generateBookingsForSchedule(schedule);

    expect(prisma.client.booking.create).toHaveBeenCalledTimes(3);
    expect(prisma.client.booking.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        scheduledAt: new Date('2026-07-08T10:00:00.000Z'),
        durationMinutes: 50,
        topic: 'Weekly Lesson (Session 1/3)',
      }),
    });
    expect(prisma.client.booking.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        scheduledAt: new Date('2026-07-08T11:00:00.000Z'),
        durationMinutes: 50,
        topic: 'Weekly Lesson (Session 2/3)',
      }),
    });
    expect(prisma.client.booking.create).toHaveBeenNthCalledWith(3, {
      data: expect.objectContaining({
        scheduledAt: new Date('2026-07-08T12:00:00.000Z'),
        durationMinutes: 50,
        topic: 'Weekly Lesson (Session 3/3)',
      }),
    });
  });

  it('does not duplicate an occurrence that already has a generated start booking', async () => {
    const { service, prisma, bookingService, tutorScheduleService } =
      createService();
    const schedule = makeSchedule();
    const occurrence = new Date('2026-07-08T10:00:00.000Z');
    const outsideWindow = new Date('2026-07-22T10:00:00.000Z');

    tutorScheduleService.getNextOccurrence
      .mockReturnValueOnce(occurrence)
      .mockReturnValueOnce(outsideWindow);
    prisma.client.booking.findFirst.mockResolvedValue({ id: 'booking-1' });
    prisma.client.tutorRecurringSchedule.update.mockResolvedValue(schedule);
    bookingService.checkOverlap.mockResolvedValue(null);

    await service.generateBookingsForSchedule(schedule);

    expect(prisma.client.booking.create).not.toHaveBeenCalled();
    expect(bookingService.checkOverlap).not.toHaveBeenCalled();
  });

  it('skips generation when another booking or template overlaps', async () => {
    const { service, prisma, bookingService, tutorScheduleService } =
      createService();
    const schedule = makeSchedule();
    const occurrence = new Date('2026-07-08T10:00:00.000Z');
    const outsideWindow = new Date('2026-07-22T10:00:00.000Z');

    tutorScheduleService.getNextOccurrence
      .mockReturnValueOnce(occurrence)
      .mockReturnValueOnce(outsideWindow);
    prisma.client.booking.findFirst.mockResolvedValue(null);
    prisma.client.tutorRecurringSchedule.update.mockResolvedValue(schedule);
    bookingService.checkOverlap.mockResolvedValue({
      conflictType: 'BOOKING',
      conflict: { id: 'other-booking' },
    });

    await service.generateBookingsForSchedule(schedule);

    expect(prisma.client.booking.create).not.toHaveBeenCalled();
    expect(bookingService.checkOverlap).toHaveBeenCalledWith(
      schedule.tutorId,
      occurrence,
      50,
      schedule.id,
    );
  });

  it('does not treat the schedule being generated as its own overlap', async () => {
    const { service, prisma, bookingService } = createService();
    const scheduledAt = new Date('2026-07-08T10:00:00.000Z');
    const schedule = makeSchedule({
      occurrencesConfig: [{ scheduledAt, title: 'Custom Lesson' }],
    });

    prisma.client.booking.findFirst.mockResolvedValue(null);
    prisma.client.booking.create.mockResolvedValue({ id: 'booking-1' });
    prisma.client.tutorRecurringSchedule.update.mockResolvedValue(schedule);
    bookingService.checkOverlap.mockImplementation(
      (_tutorId, _slotTime, _durationMinutes, excludeId) =>
        Promise.resolve(
          excludeId === schedule.id
            ? null
            : {
                conflictType: 'RECURRING_TEMPLATE',
                conflict: { id: schedule.id },
              },
        ),
    );

    await service.generateBookingsForSchedule(schedule);

    expect(bookingService.checkOverlap).toHaveBeenCalledWith(
      schedule.tutorId,
      scheduledAt,
      50,
      schedule.id,
    );
    expect(prisma.client.booking.create).toHaveBeenCalledTimes(1);
  });
});
