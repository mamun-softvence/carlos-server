import { PrismaService } from '@/lib/prisma/prisma.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RecurringFrequency, UserRole } from '@prisma/client';
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
  }

  // Find the next occurrence date/time for a given schedule configuration
  getNextOccurrence(
    frequency: RecurringFrequency,
    timeOfDay: string,
    dayOfWeek?: number,
    dayOfMonth?: number,
    baseDate: Date = new Date(),
  ): Date {
    const [hours, minutes] = timeOfDay.split(':').map(Number);
    const date = new Date(baseDate);
    date.setHours(hours, minutes, 0, 0);

    if (frequency === RecurringFrequency.DAILY) {
      if (date <= baseDate) {
        date.setDate(date.getDate() + 1);
      }
      return date;
    }

    if (frequency === RecurringFrequency.WEEKLY || frequency === RecurringFrequency.BIWEEKLY) {
      if (dayOfWeek === undefined || dayOfWeek === null) {
        throw new BadRequestException('dayOfWeek is required');
      }
      const currentDay = date.getDay();
      let distance = (dayOfWeek + 7 - currentDay) % 7;
      if (distance === 0 && date <= baseDate) {
        distance = 7;
      }
      date.setDate(date.getDate() + distance);
      return date;
    }

    if (frequency === RecurringFrequency.MONTHLY) {
      if (dayOfMonth === undefined || dayOfMonth === null) {
        throw new BadRequestException('dayOfMonth is required');
      }
      // Target day of month
      date.setDate(dayOfMonth);
      if (date <= baseDate) {
        date.setMonth(date.getMonth() + 1);
        date.setDate(dayOfMonth);
      }
      return date;
    }

    return date;
  }

  async createSchedule(tutorId: string, dto: TutorCreateRecurringScheduleDto) {
    await this.ensureTutorRole(tutorId);

    // Validate day selection constraints based on frequency
    this.bookingService.validateRecurringScheduleDays(
      dto.frequency,
      dto.dayOfWeek,
      dto.dayOfMonth,
    );

    // Check overlap at the next occurrence date
    const nextDate = this.getNextOccurrence(
      dto.frequency,
      dto.timeOfDay,
      dto.dayOfWeek,
      dto.dayOfMonth,
    );

    const overlap = await this.bookingService.checkOverlap(
      tutorId,
      nextDate,
      dto.durationMinutes,
    );
    if (overlap) {
      throw new ConflictException({
        message: 'This recurring slot overlaps with an existing booking or recurring template',
        conflictType: overlap.conflictType,
        conflict: overlap.conflict,
      });
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

    const schedule = await this.prisma.client.tutorRecurringSchedule.create({
      data: {
        tutorId,
        studentId: dto.studentId || null,
        title: dto.title,
        description: dto.description,
        tags: dto.tags || [],
        frequency: dto.frequency,
        dayOfWeek: dto.dayOfWeek ?? null,
        dayOfMonth: dto.dayOfMonth ?? null,
        timeOfDay: dto.timeOfDay,
        durationMinutes: dto.durationMinutes,
        openingWindowDays: dto.openingWindowDays,
        isActive: true,
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
    await this.ensureTutorRole(tutorId);

    const existing = await this.prisma.client.tutorRecurringSchedule.findFirst({
      where: { id, tutorId },
    });
    if (!existing) {
      throw new NotFoundException('Recurring schedule not found');
    }

    const frequency = dto.frequency ?? existing.frequency;
    const dayOfWeek = dto.dayOfWeek !== undefined ? dto.dayOfWeek : existing.dayOfWeek;
    const dayOfMonth = dto.dayOfMonth !== undefined ? dto.dayOfMonth : existing.dayOfMonth;
    const timeOfDay = dto.timeOfDay ?? existing.timeOfDay;
    const durationMinutes = dto.durationMinutes ?? existing.durationMinutes;

    // Validate day constraints if changed
    this.bookingService.validateRecurringScheduleDays(
      frequency,
      dayOfWeek ?? undefined,
      dayOfMonth ?? undefined,
    );

    // Check overlap at next occurrence if time/day changes
    if (
      dto.frequency ||
      dto.dayOfWeek !== undefined ||
      dto.dayOfMonth !== undefined ||
      dto.timeOfDay ||
      dto.durationMinutes
    ) {
      const nextDate = this.getNextOccurrence(
        frequency,
        timeOfDay,
        dayOfWeek ?? undefined,
        dayOfMonth ?? undefined,
      );

      const overlap = await this.bookingService.checkOverlap(
        tutorId,
        nextDate,
        durationMinutes,
        id,
      );
      if (overlap) {
        throw new ConflictException({
          message: 'Updated recurring slot overlaps with an existing booking or template',
          conflictType: overlap.conflictType,
          conflict: overlap.conflict,
        });
      }
    }

    const updated = await this.prisma.client.$transaction(async (tx) => {
      const res = await tx.tutorRecurringSchedule.update({
        where: { id },
        data: {
          studentId: dto.studentId !== undefined ? dto.studentId : existing.studentId,
          title: dto.title !== undefined ? dto.title : existing.title,
          description: dto.description !== undefined ? dto.description : existing.description,
          tags: dto.tags !== undefined ? dto.tags : existing.tags,
          frequency,
          dayOfWeek,
          dayOfMonth,
          timeOfDay,
          durationMinutes,
          openingWindowDays: dto.openingWindowDays ?? existing.openingWindowDays,
          isActive: dto.isActive !== undefined ? dto.isActive : existing.isActive,
        },
      });

      // Cleanup future unbooked slots if deactivated
      if (dto.isActive === false && existing.isActive) {
        await tx.booking.deleteMany({
          where: {
            recurringScheduleId: id,
            studentId: null,
            scheduledAt: { gte: new Date() },
          },
        });
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
      message: 'Recurring schedule and its unbooked future slots deleted successfully',
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
    let current = new Date();
    const limit = new Date(Date.now() + schedule.openingWindowDays * 24 * 60 * 60 * 1000);

    while (current < limit) {
      const next = this.getNextOccurrence(
        schedule.frequency,
        schedule.timeOfDay,
        schedule.dayOfWeek ?? undefined,
        schedule.dayOfMonth ?? undefined,
        current,
      );
      if (next > limit) break;
      previewDates.push(next);
      current = new Date(next.getTime());
    }

    return previewDates;
  }
}
