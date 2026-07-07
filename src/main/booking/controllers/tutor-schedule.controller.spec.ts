import { TutorScheduleController } from './tutor-schedule.controller';

describe('TutorScheduleController', () => {
  const createController = () => {
    const tutorScheduleService = {
      createSchedule: jest.fn(),
      getBookingsForSchedule: jest.fn(),
    };
    const bookingService = {};
    const bookingSchedulerService = {
      generateBookingsForSchedule: jest.fn(),
    };

    const controller = new TutorScheduleController(
      tutorScheduleService as any,
      bookingService as any,
      bookingSchedulerService as any,
    );

    return {
      controller,
      tutorScheduleService,
      bookingSchedulerService,
    };
  };

  it('generates and returns recurring bookings immediately after schedule creation', async () => {
    const { controller, tutorScheduleService, bookingSchedulerService } =
      createController();
    const schedule = {
      id: 'schedule-1',
      tutorId: 'tutor-1',
      title: 'Weekly Lesson',
    };
    const bookings = [
      {
        id: 'booking-1',
        recurringScheduleId: schedule.id,
        scheduledAt: new Date('2026-07-08T10:00:00.000Z'),
      },
    ];

    tutorScheduleService.createSchedule.mockResolvedValue({
      message: 'Recurring schedule created successfully',
      data: schedule,
    });
    bookingSchedulerService.generateBookingsForSchedule.mockResolvedValue(
      undefined,
    );
    tutorScheduleService.getBookingsForSchedule.mockResolvedValue(bookings);

    const response = await controller.createSchedule(
      { userId: 'tutor-1', role: 'TUTOR' } as any,
      { title: 'Weekly Lesson' } as any,
    );

    expect(tutorScheduleService.createSchedule).toHaveBeenCalledWith(
      'tutor-1',
      { title: 'Weekly Lesson' },
    );
    expect(
      bookingSchedulerService.generateBookingsForSchedule,
    ).toHaveBeenCalledWith(schedule);
    expect(tutorScheduleService.getBookingsForSchedule).toHaveBeenCalledWith(
      schedule.id,
    );
    expect(response).toEqual({
      message: 'Recurring schedule created successfully',
      data: {
        ...schedule,
        bookings,
      },
    });
  });
});
