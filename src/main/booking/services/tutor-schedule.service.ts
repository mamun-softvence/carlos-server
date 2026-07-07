import { PrismaService } from '@/lib/prisma/prisma.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RecurringFrequency, UserRole, LessonType } from '@prisma/client';
import { BookingService } from './booking.service';
import { TutorCreateRecurringScheduleDto } from '../dto/tutor-create-recurring-schedule.dto';
import { TutorUpdateRecurringScheduleDto } from '../dto/tutor-update-recurring-schedule.dto';

@Injectable()
export class TutorScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingService: BookingService,
  ) {}

  private async ensureTutorRole(userId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
    });
    if (!user || user.role !== UserRole.TUTOR) {
      throw new BadRequestException('User is not a tutor');
    }
    return user;
  }

  getNextOccurrenceForMultipleWeekdays(
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
        break; // safety cutoff (1 year)
      }
    }
    return current;
  }

  getOccurrenceDateTime(
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

  getOccurrenceIndexAfter(
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

  getOccurrenceIndexForDate(
    startDate: Date,
    frequency: RecurringFrequency,
    scheduledAt: Date,
    dayOfWeek?: number[] | null,
  ): number {
    let i = this.getOccurrenceIndexAfter(
      startDate,
      frequency,
      scheduledAt,
      dayOfWeek,
    );
    while (true) {
      const occurrence = this.getOccurrenceDateTime(
        startDate,
        frequency,
        i,
        dayOfWeek,
      );
      if (Math.abs(occurrence.getTime() - scheduledAt.getTime()) < 5000) {
        return i;
      }
      if (
        occurrence > scheduledAt &&
        Math.abs(occurrence.getTime() - scheduledAt.getTime()) > 5000
      ) {
        break;
      }
      i++;
      if (i > 100000) {
        break;
      }
    }
    return -1;
  }

  validateRecurringScheduleDays(
    frequency: RecurringFrequency,
    dayOfWeek?: number[],
    dayOfMonth?: number,
  ) {
    if (
      frequency === RecurringFrequency.WEEKLY ||
      frequency === RecurringFrequency.BIWEEKLY
    ) {
      if (!dayOfWeek || dayOfWeek.length === 0) {
        throw new BadRequestException(
          'dayOfWeek is required for WEEKLY and BIWEEKLY schedules',
        );
      }
    }
    if (frequency === RecurringFrequency.MONTHLY) {
      if (dayOfMonth === undefined || dayOfMonth === null) {
        throw new BadRequestException(
          'dayOfMonth is required for MONTHLY schedules',
        );
      }
    }
  }

  calculateStartDate(
    frequency: RecurringFrequency,
    timeOfDay: string,
    startFromDate: Date = new Date(),
    dayOfWeek?: number[],
    dayOfMonth?: number,
  ): Date {
    const [hours, minutes] = timeOfDay.split(':').map(Number);
    const date = new Date(startFromDate);
    date.setHours(hours, minutes, 0, 0);

    if (frequency === RecurringFrequency.DAILY) {
      // No extra offset needed
    } else if (
      frequency === RecurringFrequency.WEEKLY ||
      frequency === RecurringFrequency.BIWEEKLY
    ) {
      if (!dayOfWeek || dayOfWeek.length === 0) {
        throw new BadRequestException(
          'dayOfWeek is required for WEEKLY and BIWEEKLY schedules',
        );
      }
      const sortedDays = [...dayOfWeek].sort((a, b) => a - b);
      const currentDay = date.getDay();
      let targetDay = sortedDays.find((d) => d >= currentDay);
      if (targetDay === undefined) {
        targetDay = sortedDays[0];
      }
      const distance = (targetDay + 7 - currentDay) % 7;
      date.setDate(date.getDate() + distance);
    } else if (frequency === RecurringFrequency.MONTHLY) {
      if (dayOfMonth === undefined || dayOfMonth === null) {
        throw new BadRequestException(
          'dayOfMonth is required for MONTHLY schedules',
        );
      }
      const currentDayOfMonth = date.getDate();
      if (currentDayOfMonth > dayOfMonth) {
        date.setMonth(date.getMonth() + 1);
      }
      date.setDate(dayOfMonth);
    }

    // Shift forward if start date/time lies in the past
    if (date < new Date()) {
      if (frequency === RecurringFrequency.DAILY) {
        date.setDate(date.getDate() + 1);
      } else if (
        frequency === RecurringFrequency.WEEKLY ||
        frequency === RecurringFrequency.BIWEEKLY
      ) {
        const next = this.getNextOccurrenceForMultipleWeekdays(
          date,
          frequency,
          dayOfWeek!,
          date,
        );
        date.setTime(next.getTime());
      } else if (frequency === RecurringFrequency.MONTHLY) {
        date.setMonth(date.getMonth() + 1);
      }
    }

    return date;
  }

  getNextOccurrence(
    frequency: RecurringFrequency,
    startDate: Date,
    baseDate: Date = new Date(),
    dayOfWeek?: number[] | null,
  ): Date {
    let i = this.getOccurrenceIndexAfter(
      startDate,
      frequency,
      baseDate,
      dayOfWeek,
    );
    while (true) {
      const occurrence = this.getOccurrenceDateTime(
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

  getEstimatedOccurrencesCount(
    startDate: Date,
    frequency: RecurringFrequency,
    openingWindowDays: number,
    dayOfWeek?: number[] | null,
    endDate?: Date | null,
  ): number {
    const now = new Date();
    const limitDate = new Date(
      Date.now() + openingWindowDays * 24 * 60 * 60 * 1000,
    );
    const upperLimit = endDate && endDate < limitDate ? endDate : limitDate;

    let current = now;
    let count = 0;
    while (true) {
      const next = this.getNextOccurrence(
        frequency,
        startDate,
        current,
        dayOfWeek,
      );
      if (next > upperLimit) {
        break;
      }
      count++;
      current = new Date(next.getTime());
      if (count > 100) break; // safety cutoff
    }
    return count;
  }

  async createSchedule(tutorId: string, dto: TutorCreateRecurringScheduleDto) {
    const tutor = await this.ensureTutorRole(tutorId);

    const lessonType = dto.lessonType ?? LessonType.REGULAR;
    this.bookingService.validateTutorLessonCapability(tutor, lessonType);

    this.validateRecurringScheduleDays(
      dto.frequency,
      dto.dayOfWeek,
      dto.dayOfMonth,
    );

    const startDate = this.calculateStartDate(
      dto.frequency,
      dto.timeOfDay,
      dto.startFromDate || new Date(),
      dto.dayOfWeek,
      dto.dayOfMonth,
    );

    if (dto.endDate && dto.endDate <= startDate) {
      throw new BadRequestException(
        'endDate must be after the calculated start date',
      );
    }

    const durationHours = dto.durationHours || 1;
    const isPackage = dto.isPackage !== undefined ? dto.isPackage : true;

    // 1. Verify that there are no overlaps for all generated occurrences within the opening window (for all H hours)
    const limitDate = new Date(
      Date.now() + dto.openingWindowDays * 24 * 60 * 60 * 1000,
    );

    let currentCheck = new Date();
    while (true) {
      const nextDate = this.getNextOccurrence(
        dto.frequency,
        startDate,
        currentCheck,
        dto.dayOfWeek,
      );

      if (nextDate > limitDate) {
        break;
      }
      if (dto.endDate && nextDate > dto.endDate) {
        break;
      }

      for (let i = 0; i < durationHours; i++) {
        const slotTime = new Date(nextDate.getTime() + i * 60 * 60 * 1000);
        const overlap = await this.bookingService.checkOverlap(
          tutorId,
          slotTime,
          50,
        );
        if (overlap) {
          throw new ConflictException({
            message: `This recurring slot segment at ${slotTime.toISOString()} overlaps with an existing booking or recurring template`,
            conflictType: overlap.conflictType,
            conflict: overlap.conflict,
          });
        }
      }
      currentCheck = new Date(nextDate.getTime());
    }
    // 2. Verify each dedicated class datetime in occurrencesConfig does not overlap and is authorized
    if (dto.occurrencesConfig && dto.occurrencesConfig.length > 0) {
      const now = new Date();
      for (const item of dto.occurrencesConfig) {
        const baseScheduledAt = new Date(item.scheduledAt);
        if (baseScheduledAt <= now) {
          throw new BadRequestException(
            `Class date-time must be in the future: ${baseScheduledAt.toISOString()}`,
          );
        }

        if (item.lessonType) {
          this.bookingService.validateTutorLessonCapability(
            tutor,
            item.lessonType,
          );
        }

        for (let i = 0; i < durationHours; i++) {
          const slotTime = new Date(
            baseScheduledAt.getTime() + i * 60 * 60 * 1000,
          );
          const overlap = await this.bookingService.checkOverlap(
            tutorId,
            slotTime,
            50,
          );
          if (overlap) {
            throw new ConflictException({
              message: `The occurrence segment at ${slotTime.toISOString()} overlaps with an existing booking or template`,
              conflictType: overlap.conflictType,
              conflict: overlap.conflict,
            });
          }
        }
      }
    }
    // Verify student exists if specified
    if (dto.studentId) {
      const student = await this.prisma.client.user.findUnique({
        where: { id: dto.studentId },
      });
      if (!student || student.role !== UserRole.STUDENT) {
        throw new BadRequestException('Student not found');
      }
    }

    if (dto.blockedDateRanges && dto.blockedDateRanges.length > 0) {
      for (const range of dto.blockedDateRanges) {
        if (range.startDate > range.endDate) {
          throw new BadRequestException(
            `Invalid blocked date range: ${range.startDate} to ${range.endDate}. startDate must be before or equal to endDate.`,
          );
        }
      }
    }

    const schedule = await this.prisma.client.tutorRecurringSchedule.create({
      data: {
        tutorId,
        studentId: dto.studentId || null,
        title: dto.title,
        description: dto.description,
        tags: dto.tags || [],
        frequency: dto.frequency,
        dayOfWeek: dto.dayOfWeek ?? [],
        dayOfMonth: dto.dayOfMonth ?? null,
        timeOfDay: dto.timeOfDay,
        startDate: startDate,
        endDate: dto.endDate || null,
        durationHours,
        isPackage,
        openingWindowDays: dto.openingWindowDays,
        occurrencesConfig: dto.occurrencesConfig
          ? JSON.parse(JSON.stringify(dto.occurrencesConfig))
          : null,
        blockedDateRanges: dto.blockedDateRanges
          ? JSON.parse(JSON.stringify(dto.blockedDateRanges))
          : null,
        isActive: true,
        lessonType,
      },
    });

    return {
      message: 'Recurring schedule created successfully',
      data: schedule,
    };
  }

  async getSchedules(tutorId: string) {
    await this.ensureTutorRole(tutorId);
    return this.prisma.client.tutorRecurringSchedule.findMany({
      where: { tutorId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getScheduleById(tutorId: string, id: string) {
    await this.ensureTutorRole(tutorId);
    const schedule = await this.prisma.client.tutorRecurringSchedule.findFirst({
      where: { id, tutorId },
    });
    if (!schedule) {
      throw new NotFoundException('Recurring schedule not found');
    }
    return schedule;
  }

  async updateSchedule(
    tutorId: string,
    id: string,
    dto: TutorUpdateRecurringScheduleDto,
  ) {
    const tutor = await this.ensureTutorRole(tutorId);

    const existing = await this.prisma.client.tutorRecurringSchedule.findFirst({
      where: { id, tutorId },
    });
    if (!existing) {
      throw new NotFoundException('Recurring schedule not found');
    }

    const lessonType = dto.lessonType ?? existing.lessonType;
    if (dto.lessonType !== undefined) {
      this.bookingService.validateTutorLessonCapability(tutor, lessonType);
    }

    if (dto.occurrencesConfig && dto.occurrencesConfig.length > 0) {
      for (const item of dto.occurrencesConfig) {
        if (item.lessonType) {
          this.bookingService.validateTutorLessonCapability(
            tutor,
            item.lessonType,
          );
        }
      }
    }

    const frequency = dto.frequency ?? existing.frequency;
    const dayOfWeek =
      dto.dayOfWeek !== undefined ? dto.dayOfWeek : existing.dayOfWeek;
    const dayOfMonth =
      dto.dayOfMonth !== undefined ? dto.dayOfMonth : existing.dayOfMonth;
    const timeOfDay = dto.timeOfDay ?? existing.timeOfDay;
    const durationHours = dto.durationHours ?? existing.durationHours;
    const isPackage =
      dto.isPackage !== undefined ? dto.isPackage : existing.isPackage;

    this.validateRecurringScheduleDays(
      frequency,
      dayOfWeek ?? undefined,
      dayOfMonth ?? undefined,
    );

    let startDate = existing.startDate;
    if (
      dto.frequency ||
      dto.timeOfDay ||
      dto.dayOfWeek !== undefined ||
      dto.dayOfMonth !== undefined ||
      dto.startFromDate
    ) {
      const baseDate = dto.startFromDate ?? new Date();
      startDate = this.calculateStartDate(
        frequency,
        timeOfDay,
        baseDate,
        dayOfWeek ?? undefined,
        dayOfMonth ?? undefined,
      );
    }

    const endDate = dto.endDate !== undefined ? dto.endDate : existing.endDate;
    if (endDate && endDate <= startDate) {
      throw new BadRequestException(
        'endDate must be after the calculated start date',
      );
    }

    // Check base overlap at next occurrence if timing changes
    if (
      dto.frequency ||
      dto.timeOfDay ||
      dto.dayOfWeek !== undefined ||
      dto.dayOfMonth !== undefined ||
      dto.startFromDate ||
      dto.endDate !== undefined ||
      dto.durationHours
    ) {
      const nextDate = this.getNextOccurrence(
        frequency,
        startDate,
        new Date(),
        dayOfWeek,
      );

      for (let i = 0; i < durationHours; i++) {
        const slotTime = new Date(nextDate.getTime() + i * 60 * 60 * 1000);
        const overlap = await this.bookingService.checkOverlap(
          tutorId,
          slotTime,
          50,
          id,
        );
        if (overlap) {
          throw new ConflictException({
            message: `Updated recurring slot segment at ${slotTime.toISOString()} overlaps with an existing booking or template`,
            conflictType: overlap.conflictType,
            conflict: overlap.conflict,
          });
        }
      }
    }

    // Check overlap for new occurrencesConfig datetimes if updated
    if (dto.occurrencesConfig && dto.occurrencesConfig.length > 0) {
      const now = new Date();
      for (const item of dto.occurrencesConfig) {
        const baseScheduledAt = new Date(item.scheduledAt);
        if (baseScheduledAt <= now) {
          throw new BadRequestException(
            `Class date-time must be in the future: ${baseScheduledAt.toISOString()}`,
          );
        }

        for (let i = 0; i < durationHours; i++) {
          const slotTime = new Date(
            baseScheduledAt.getTime() + i * 60 * 60 * 1000,
          );
          const overlap = await this.bookingService.checkOverlap(
            tutorId,
            slotTime,
            50,
            id,
          );
          if (overlap) {
            throw new ConflictException({
              message: `The updated occurrence segment at ${slotTime.toISOString()} overlaps with an existing booking or template`,
              conflictType: overlap.conflictType,
              conflict: overlap.conflict,
            });
          }
        }
      }
    }

    if (dto.blockedDateRanges && dto.blockedDateRanges.length > 0) {
      for (const range of dto.blockedDateRanges) {
        if (range.startDate > range.endDate) {
          throw new BadRequestException(
            `Invalid blocked date range: ${range.startDate} to ${range.endDate}. startDate must be before or equal to endDate.`,
          );
        }
      }
    }

    const timingChanged =
      dto.frequency !== undefined ||
      dto.timeOfDay !== undefined ||
      dto.dayOfWeek !== undefined ||
      dto.dayOfMonth !== undefined ||
      dto.startFromDate !== undefined ||
      dto.endDate !== undefined ||
      dto.durationHours !== undefined ||
      dto.occurrencesConfig !== undefined ||
      dto.isPackage !== undefined ||
      dto.lessonType !== undefined ||
      dto.blockedDateRanges !== undefined;

    const updated = await this.prisma.client.$transaction(async (tx) => {
      const res = await tx.tutorRecurringSchedule.update({
        where: { id },
        data: {
          studentId:
            dto.studentId !== undefined ? dto.studentId : existing.studentId,
          title: dto.title !== undefined ? dto.title : existing.title,
          description:
            dto.description !== undefined
              ? dto.description
              : existing.description,
          tags: dto.tags !== undefined ? dto.tags : existing.tags,
          frequency,
          dayOfWeek,
          dayOfMonth,
          timeOfDay,
          startDate,
          endDate,
          durationHours,
          isPackage,
          lessonType,
          openingWindowDays:
            dto.openingWindowDays ?? existing.openingWindowDays,
          isActive:
            dto.isActive !== undefined ? dto.isActive : existing.isActive,
          occurrencesConfig:
            dto.occurrencesConfig !== undefined
              ? dto.occurrencesConfig
                ? JSON.parse(JSON.stringify(dto.occurrencesConfig))
                : null
              : existing.occurrencesConfig,
          blockedDateRanges:
            dto.blockedDateRanges !== undefined
              ? dto.blockedDateRanges
                ? JSON.parse(JSON.stringify(dto.blockedDateRanges))
                : null
              : existing.blockedDateRanges,
          // Reset watermark if timing changed to force regeneration
          lastGeneratedUpTo: timingChanged ? null : existing.lastGeneratedUpTo,
        },
      });

      // Branch A: Timing or deactivation changes -> Delete future unbooked slots
      if (timingChanged || (dto.isActive === false && existing.isActive)) {
        await tx.booking.deleteMany({
          where: {
            recurringScheduleId: id,
            studentId: null,
            scheduledAt: { gte: new Date() },
          },
        });
      } else if (
        !timingChanged &&
        (dto.title !== undefined ||
          dto.description !== undefined ||
          dto.tags !== undefined ||
          dto.occurrencesConfig !== undefined ||
          dto.lessonType !== undefined)
      ) {
        // Branch B: Content-only update -> Sync changes to future unbooked slots
        const futureBookings = await tx.booking.findMany({
          where: {
            recurringScheduleId: id,
            studentId: null,
            scheduledAt: { gte: new Date() },
          },
        });

        for (const booking of futureBookings) {
          if (!booking.scheduledAt) continue;
          const index = this.getOccurrenceIndexForDate(
            res.startDate,
            res.frequency,
            booking.scheduledAt,
            res.dayOfWeek,
          );
          if (index !== -1) {
            const configItem = (res.occurrencesConfig as any)?.[index];
            const topic = configItem?.title || res.title || 'Lesson Slot';
            const note = configItem?.description || res.description || '';
            const slotLessonType = configItem?.lessonType || res.lessonType;
            await tx.booking.update({
              where: { id: booking.id },
              data: {
                topic,
                note,
                tags: res.tags,
                lessonType: slotLessonType,
              },
            });
          }
        }
      }

      return res;
    });
    return {
      message: 'Recurring schedule updated successfully',
      data: updated,
    };
  }

  async deleteSchedule(tutorId: string, id: string) {
    await this.ensureTutorRole(tutorId);

    const existing = await this.prisma.client.tutorRecurringSchedule.findFirst({
      where: { id, tutorId },
    });
    if (!existing) {
      throw new NotFoundException('Recurring schedule not found');
    }

    await this.prisma.client.$transaction(async (tx) => {
      // 1. Delete future unbooked bookings generated from this schedule template
      await tx.booking.deleteMany({
        where: {
          recurringScheduleId: id,
          studentId: null,
          scheduledAt: { gte: new Date() },
        },
      });

      // 2. Delete the recurring schedule template
      await tx.tutorRecurringSchedule.delete({
        where: { id },
      });
    });

    return {
      message:
        'Recurring schedule and its unbooked future slots deleted successfully',
    };
  }

  async previewSchedule(tutorId: string, id: string): Promise<Date[]> {
    await this.ensureTutorRole(tutorId);

    const schedule = await this.prisma.client.tutorRecurringSchedule.findFirst({
      where: { id, tutorId },
    });
    if (!schedule) {
      throw new NotFoundException('Recurring schedule not found');
    }

    const previewDates: Date[] = [];
    const now = new Date();
    const limit = new Date(
      Date.now() + schedule.openingWindowDays * 24 * 60 * 60 * 1000,
    );

    let i = 0;
    while (true) {
      const next = this.getOccurrenceDateTime(
        schedule.startDate,
        schedule.frequency,
        i,
        schedule.dayOfWeek,
      );
      if (next > limit) {
        break;
      }
      if (next >= now) {
        previewDates.push(next);
      }
      i++;
      if (i > 10000) break;
    }

    return previewDates;
  }

  async getBookingsForSchedule(scheduleId: string) {
    return this.prisma.client.booking.findMany({
      where: { recurringScheduleId: scheduleId },
      orderBy: { scheduledAt: 'asc' },
    });
  }
}
