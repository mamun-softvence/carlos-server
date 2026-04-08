import {
  CurrentUser,
  CurrentUserData,
} from '@/common/dto/current-user.decorator';
import { Roles } from '@/common/dto/roles.decorator';
import { JwtAuthGuard, RolesGuard } from '@/core/jwt/jwt.guard';
import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { BookingService } from '../services/booking.service';
import { AdminAssignTutorDto } from '../dto/admin-assign-tutor.dto';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/bookings')
export class BookingAdminController {
  constructor(private readonly bookingService: BookingService) {}

  @Patch(':bookingId/assign-tutor')
  @ApiBody({
    type: AdminAssignTutorDto,
    examples: {
      assignTutor: {
        summary: 'Assign tutor to a booking',
        value: {
          tutorId: '7c8c8f71-9d23-4f17-bc95-6a2a7bbf6c31',
          scheduledAt: '2026-04-10T13:00:00.000Z',
          durationMinutes: 60,
          topic: 'Higher Math Revision Session',
          note: 'Focus on integration and exam preparation.',
        },
      },
    },
  })
  assignTutor(
    @CurrentUser() user: CurrentUserData,
    @Param('bookingId') bookingId: string,
    @Body() dto: AdminAssignTutorDto,
  ) {
    return this.bookingService.assignTutor(user.userId, bookingId, dto);
  }
}
