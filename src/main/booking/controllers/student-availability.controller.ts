import { Roles } from '@/common/dto/roles.decorator';
import { JwtAuthGuard, RolesGuard } from '@/core/jwt/jwt.guard';
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { BookingService } from '../services/booking.service';
import {
  CurrentUser,
  CurrentUserData,
} from '@/common/dto/current-user.decorator';
import { StudentBookAvailabilityDto } from '../dto/student-book-availability.dto';

@ApiTags('Student Availability Bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@Controller('student')
export class StudentAvailabilityController {
  constructor(private readonly bookingService: BookingService) {}

  @Get('tutors/:tutorId/availabilities')
  @ApiOperation({ summary: 'Get all available slots for a specific tutor' })
  getAvailableSlots(@Param('tutorId') tutorId: string) {
    return this.bookingService.getAvailableSlotsForStudent(tutorId);
  }

  @Post('availabilities/:id/book')
  @ApiOperation({ summary: 'Book a tutor availability slot' })
  bookAvailability(
    @CurrentUser() user: CurrentUserData,
    @Param('id') availabilityId: string,
    @Body() dto: StudentBookAvailabilityDto,
  ) {
    return this.bookingService.studentBookAvailability(
      user.userId,
      availabilityId,
      dto,
    );
  }
}
