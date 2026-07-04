import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '@/common/dto/roles.decorator';
import { JwtAuthGuard, RolesGuard } from '@/core/jwt/jwt.guard';
import { CurrentUser, CurrentUserData } from '@/common/dto/current-user.decorator';
import { TutorScheduleService } from '../services/tutor-schedule.service';
import { BookingService } from '../services/booking.service';
import { BookingSchedulerService } from '../services/booking-scheduler.service';
import { TutorCreateRecurringScheduleDto } from '../dto/tutor-create-recurring-schedule.dto';
import { TutorUpdateRecurringScheduleDto } from '../dto/tutor-update-recurring-schedule.dto';
import { TutorCreateCasualBookingDto } from '../dto/tutor-create-casual-booking.dto';
import { TutorCheckOverlapQueryDto } from '../dto/tutor-check-overlap-query.dto';

@ApiTags('Tutor Scheduling')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TUTOR)
@Controller('tutor')
export class TutorScheduleController {
  constructor(
    private readonly tutorScheduleService: TutorScheduleService,
    private readonly bookingService: BookingService,
    private readonly bookingSchedulerService: BookingSchedulerService,
  ) {}

  @Post('recurring-schedules')
  @ApiOperation({ summary: 'Create a new recurring schedule slot' })
  createSchedule(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: TutorCreateRecurringScheduleDto,
  ) {
    return this.tutorScheduleService.createSchedule(user.userId, dto);
  }

  @Get('recurring-schedules')
  @ApiOperation({ summary: 'List all recurring schedules for the tutor' })
  getSchedules(@CurrentUser() user: CurrentUserData) {
    return this.tutorScheduleService.getSchedules(user.userId);
  }

  @Get('recurring-schedules/:id')
  @ApiOperation({ summary: 'Get details of a specific recurring schedule' })
  getScheduleById(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
  ) {
    return this.tutorScheduleService.getScheduleById(user.userId, id);
  }

  @Get('recurring-schedules/:id/preview')
  @ApiOperation({ summary: 'Preview generated dates for a recurring schedule' })
  async previewSchedule(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
  ) {
    const dates = await this.tutorScheduleService.previewSchedule(user.userId, id);
    return {
      message: 'Schedule dates preview computed successfully',
      data: dates,
    };
  }

  @Patch('recurring-schedules/:id')
  @ApiOperation({ summary: 'Update a recurring schedule configuration' })
  updateSchedule(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: TutorUpdateRecurringScheduleDto,
  ) {
    return this.tutorScheduleService.updateSchedule(user.userId, id, dto);
  }

  @Delete('recurring-schedules/:id')
  @ApiOperation({ summary: 'Delete a recurring schedule template and clean up unbooked slots' })
  deleteSchedule(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
  ) {
    return this.tutorScheduleService.deleteSchedule(user.userId, id);
  }

  @Post('bookings/casual')
  @ApiOperation({ summary: 'Create a one-off casual booking slot' })
  createCasualBooking(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: TutorCreateCasualBookingDto,
  ) {
    return this.bookingService.createCasualBooking(user.userId, dto);
  }

  @Get('bookings')
  @ApiOperation({ summary: 'Get all bookings for the current tutor' })
  getTutorBookings(@CurrentUser() user: CurrentUserData) {
    return this.bookingService.getTutorBookings(user.userId);
  }

  @Get('bookings/check-overlap')
  @ApiOperation({ summary: 'Check if a specific slot overlaps with bookings or recurring templates' })
  @ApiQuery({ type: TutorCheckOverlapQueryDto })
  async checkOverlap(
    @CurrentUser() user: CurrentUserData,
    @Query() query: TutorCheckOverlapQueryDto,
  ) {
    const scheduledAt = new Date(query.scheduledAt);
    const overlap = await this.bookingService.checkOverlap(
      user.userId,
      scheduledAt,
      query.durationMinutes,
      query.excludeId,
    );

    return {
      overlapping: !!overlap,
      conflictType: overlap?.conflictType || null,
      conflict: overlap?.conflict || null,
    };
  }

  @Get('bookings/:id')
  @ApiOperation({ summary: 'Get detailed booking by ID for the current tutor' })
  getTutorBookingById(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
  ) {
    return this.bookingService.getTutorBookingById(user.userId, id);
  }

  @Post('bookings/trigger-generator')
  @ApiOperation({ summary: 'Manually trigger periodic booking generation' })
  async triggerGenerator() {
    await this.bookingSchedulerService.generateBookings();
    return {
      message: 'Booking generation triggered successfully',
    };
  }
}
