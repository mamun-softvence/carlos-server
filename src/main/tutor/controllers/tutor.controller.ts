import {
  CurrentUser,
  CurrentUserData,
} from '@/common/dto/current-user.decorator';
import { Roles } from '@/common/dto/roles.decorator';
import { JwtAuthGuard, RolesGuard } from '@/core/jwt/jwt.guard';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { TutorService } from '../services/tutor.service';

@ApiTags('Tutor')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TUTOR)
@Controller('tutor')
export class TutorController {
  constructor(private readonly tutorService: TutorService) {}

  @Get('students')
  @ApiOperation({
    summary: 'Get all students who have bookings assigned to the tutor',
  })
  getMyStudents(@CurrentUser() user: CurrentUserData) {
    return this.tutorService.getMyStudents(user.userId);
  }

  @Get('bookings')
  @ApiOperation({ summary: 'Get all bookings for the authenticated tutor' })
  getMyBookings(@CurrentUser() user: CurrentUserData) {
    return this.tutorService.getMyBookings(user.userId);
  }
}
