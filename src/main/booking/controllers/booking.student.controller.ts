import { Roles } from '@/common/dto/roles.decorator';
import { JwtAuthGuard, RolesGuard } from '@/core/jwt/jwt.guard';
import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { BookingService } from '../services/booking.service';
import {
  CurrentUser,
  CurrentUserData,
} from '@/common/dto/current-user.decorator';
import { StudentCreateBookingRequestDto } from '../dto/student-create-booking-request.dto';

@ApiTags('Student Bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@Controller('student/bookings')
export class BookingStudentController {
  constructor(private readonly bookingService: BookingService) {}

  @Post('request')
  @ApiOperation({ summary: 'Create a booking request as a student' })
  @ApiBody({
    type: StudentCreateBookingRequestDto,
    examples: {
      createStudentBooking: {
        summary: 'Student booking request example',
        value: {
          topic: 'Higher Math Revision Session',
          note: 'Need help with integration, differentiation, and exam prep.',
          requestedDate: '2026-04-10',
          requestedTimeLabel: '7:00 PM - 8:00 PM',
        },
      },
    },
  })
  createRequest(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: StudentCreateBookingRequestDto,
  ) {
    return this.bookingService.createStudentRequest(user.userId, dto);
  }

  @Post(':bookingId/book')
  @ApiOperation({ summary: 'Book/claim a single non-package open class slot' })
  @ApiParam({
    name: 'bookingId',
    description: 'Unique ID of the unbooked class slot',
  })
  bookSingleSlot(
    @CurrentUser() user: CurrentUserData,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookingService.studentBookSlot(user.userId, bookingId);
  }

  @Post('package/:recurringScheduleId')
  @ApiOperation({ summary: 'Book an entire recurring schedule package of slots' })
  @ApiParam({
    name: 'recurringScheduleId',
    description: 'Unique ID of the recurring schedule template package',
  })
  bookPackage(
    @CurrentUser() user: CurrentUserData,
    @Param('recurringScheduleId') recurringScheduleId: string,
  ) {
    return this.bookingService.studentBookPackage(user.userId, recurringScheduleId);
  }
}
