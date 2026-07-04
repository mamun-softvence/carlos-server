import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingCreatedBy, BookingStatus, LiveClassStatus, TutorBookingType } from '@prisma/client';
import { PrismaService } from '@/lib/prisma/prisma.service';
import { BookingService } from './booking.service';
import { TutorScheduleService } from './tutor-schedule.service';

@Injectable()
export class BookingSchedulerService {
  private readonly logger = new Logger(BookingSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingService: BookingService,
    private readonly tutorScheduleService: TutorScheduleService,
  ) {}

  // Run every day at midnight to generate recurring schedule bookings
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    this.logger.log('Starting periodic booking generation...');
    await this.generateBookings();
    this.logger.log('Periodic booking generation completed.');
  }

  async generateBookings() {
    const activeSchedules = await this.prisma.client.tutorRecurringSchedule.findMany({
      where: { isActive: true },
    });

    for (const schedule of activeSchedules) {
      try {
        const now = new Date();
        const limitDate = new Date(Date.now() + schedule.openingWindowDays * 24 * 60 * 60 * 1000);
        
        // Start generating from the maximum of NOW or lastGeneratedUpTo
        let current = schedule.lastGeneratedUpTo && new Date(schedule.lastGeneratedUpTo) > now
          ? new Date(schedule.lastGeneratedUpTo)
          : now;

        let generatedCount = 0;

        while (true) {
          const nextOccurrence = this.tutorScheduleService.getNextOccurrence(
            schedule.frequency,
            schedule.timeOfDay,
            schedule.dayOfWeek ?? undefined,
            schedule.dayOfMonth ?? undefined,
            current,
          );

          if (nextOccurrence > limitDate) {
            break;
          }

          // Check for conflicts
          const overlap = await this.bookingService.checkOverlap(
            schedule.tutorId,
            nextOccurrence,
            schedule.durationMinutes,
          );

          if (!overlap) {
            try {
              await this.prisma.client.booking.create({
                data: {
                  tutorId: schedule.tutorId,
                  studentId: schedule.studentId || null,
                  createdBy: BookingCreatedBy.TUTOR,
                  status: BookingStatus.SCHEDULED,
                  liveClassStatus: LiveClassStatus.SCHEDULED,
                  topic: schedule.title,
                  note: schedule.description,
                  tags: schedule.tags,
                  tutorBookingType: TutorBookingType.RECURRING,
                  recurringScheduleId: schedule.id,
                  scheduledAt: nextOccurrence,
                  durationMinutes: schedule.durationMinutes,
                },
              });
              generatedCount++;
            } catch (err: any) {
              // Handle P2002 Unique constraint violation if it already exists
              if (err?.code !== 'P2002') {
                this.logger.error(
                  `Error generating booking for schedule ${schedule.id} at ${nextOccurrence.toISOString()}:`,
                  err,
                );
              }
            }
          }

          // Advance current marker
          current = new Date(nextOccurrence.getTime());
        }

        // Update schedule generation watermark
        await this.prisma.client.tutorRecurringSchedule.update({
          where: { id: schedule.id },
          data: { lastGeneratedUpTo: limitDate },
        });

        if (generatedCount > 0) {
          this.logger.log(
            `Generated ${generatedCount} bookings for tutor ${schedule.tutorId} from schedule ${schedule.id}`,
          );
        }
      } catch (err) {
        this.logger.error(`Failed to generate bookings for schedule ${schedule.id}:`, err);
      }
    }
  }
}
