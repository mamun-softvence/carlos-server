import { Roles } from '@/common/dto/roles.decorator';
import { JwtAuthGuard, RolesGuard } from '@/core/jwt/jwt.guard';
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { BookingService } from '../services/booking.service';
import {
  CurrentUser,
  CurrentUserData,
} from '@/common/dto/current-user.decorator';
import { TutorCreateBookingDto } from '../dto/tutor-create-booking.dto';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TUTOR)
@Controller('tutor/bookings')
export class BookingTutorController {
  constructor(private readonly bookingService: BookingService) {}

  @Post()
  @ApiBody({
    type: TutorCreateBookingDto,
    examples: {
      tutorCreateBooking: {
        summary: 'Tutor schedules a class for multiple students',
        value: {
          studentIds: [
            '4b572b45-238e-4011-b3e2-da75fb7a0a44',
            '70a24771-98df-441f-ad2b-79ab2fe8fd63',
          ],
          scheduledAt: '2026-04-12T14:00:00.000Z',
          durationMinutes: 60,
          topic: 'Physics Problem Solving Session',
          note: 'Cover motion equations, vectors, and exam practice.',
        },
      },
    },
  })
  createForStudent(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: TutorCreateBookingDto,
  ) {
    return this.bookingService.tutorCreateBooking(user.userId, dto);
  }
}
