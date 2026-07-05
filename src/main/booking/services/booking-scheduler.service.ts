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
        
        let generatedCount = 0;

        const configArray = schedule.occurrencesConfig as any[];
        if (configArray && Array.isArray(configArray) && configArray.length > 0) {
          // Dedicated occurrence datetime generation
          for (const item of configArray) {
            if (!item.scheduledAt) continue;
            const scheduledAt = new Date(item.scheduledAt);
            
            // Only generate if scheduledAt is within opening window and in the future
            if (scheduledAt > limitDate || scheduledAt < now) {
              continue;
            }

            // Skip if it exceeds the template's end date
            if (schedule.endDate && scheduledAt > schedule.endDate) {
              continue;
            }

            // Check if booking already exists for this template at this datetime
            const existingBooking = await this.prisma.client.booking.findFirst({
              where: {
                recurringScheduleId: schedule.id,
                scheduledAt,
              },
            });
            if (existingBooking) {
              continue;
            }

            // Check overlap for each hourly segment of the occurrence
            let hasOverlap = false;
            for (let i = 0; i < schedule.durationHours; i++) {
              const slotTime = new Date(scheduledAt.getTime() + i * 60 * 60 * 1000);
              const overlap = await this.bookingService.checkOverlap(
                schedule.tutorId,
                slotTime,
                50,
              );
              if (overlap) {
                hasOverlap = true;
                break;
              }
            }

            if (!hasOverlap) {
              try {
                for (let i = 0; i < schedule.durationHours; i++) {
                  const slotTime = new Date(scheduledAt.getTime() + i * 60 * 60 * 1000);
                  const topic = item.title || schedule.title || 'Lesson Slot';
                  const displayTopic = schedule.durationHours > 1 
                    ? `${topic} (Session ${i + 1}/${schedule.durationHours})`
                    : topic;
                  const note = item.description || schedule.description || '';
                  const tags = item.tags || schedule.tags || [];

                  await this.prisma.client.booking.create({
                    data: {
                      tutorId: schedule.tutorId,
                      studentId: schedule.studentId || null,
                      createdBy: BookingCreatedBy.TUTOR,
                      status: BookingStatus.SCHEDULED,
                      liveClassStatus: LiveClassStatus.SCHEDULED,
                      topic: displayTopic,
                      note,
                      tags,
                      tutorBookingType: TutorBookingType.RECURRING,
                      recurringScheduleId: schedule.id,
                      scheduledAt: slotTime,
                      durationMinutes: 50,
                      isPackage: schedule.isPackage,
                    },
                  });
                  generatedCount++;
                }
              } catch (err: any) {
                this.logger.error(
                  `Error generating bookings for schedule ${schedule.id} at ${scheduledAt.toISOString()}:`,
                  err,
                );
              }
            }
          }
        } else {
          // Fall back to original frequency-based generation
          let current = schedule.lastGeneratedUpTo && new Date(schedule.lastGeneratedUpTo) > now
            ? new Date(schedule.lastGeneratedUpTo)
            : now;

          while (true) {
            const nextOccurrence = this.tutorScheduleService.getNextOccurrence(
              schedule.frequency,
              schedule.startDate,
              current,
              schedule.dayOfWeek,
            );

            if (nextOccurrence > limitDate) {
              break;
            }

            // Halt if occurrence exceeds end date
            if (schedule.endDate && nextOccurrence > schedule.endDate) {
              break;
            }

            // Check overlap for each hourly segment of the occurrence
            let hasOverlap = false;
            for (let i = 0; i < schedule.durationHours; i++) {
              const slotTime = new Date(nextOccurrence.getTime() + i * 60 * 60 * 1000);
              const overlap = await this.bookingService.checkOverlap(
                schedule.tutorId,
                slotTime,
                50,
              );
              if (overlap) {
                hasOverlap = true;
                break;
              }
            }

            if (!hasOverlap) {
              try {
                for (let i = 0; i < schedule.durationHours; i++) {
                  const slotTime = new Date(nextOccurrence.getTime() + i * 60 * 60 * 1000);
                  const displayTopic = schedule.durationHours > 1
                    ? `${schedule.title || 'Lesson Slot'} (Session ${i + 1}/${schedule.durationHours})`
                    : (schedule.title || 'Lesson Slot');

                  await this.prisma.client.booking.create({
                    data: {
                      tutorId: schedule.tutorId,
                      studentId: schedule.studentId || null,
                      createdBy: BookingCreatedBy.TUTOR,
                      status: BookingStatus.SCHEDULED,
                      liveClassStatus: LiveClassStatus.SCHEDULED,
                      topic: displayTopic,
                      note: schedule.description || '',
                      tags: schedule.tags,
                      tutorBookingType: TutorBookingType.RECURRING,
                      recurringScheduleId: schedule.id,
                      scheduledAt: slotTime,
                      durationMinutes: 50,
                      isPackage: schedule.isPackage,
                    },
                  });
                  generatedCount++;
                }
              } catch (err: any) {
                this.logger.error(
                  `Error generating bookings for schedule ${schedule.id} at ${nextOccurrence.toISOString()}:`,
                  err,
                );
              }
            }

            // Advance current marker
            current = new Date(nextOccurrence.getTime());
          }
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
