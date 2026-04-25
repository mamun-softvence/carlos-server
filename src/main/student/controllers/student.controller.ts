import {
  CurrentUser,
  CurrentUserData,
} from '@/common/dto/current-user.decorator';
import { Roles } from '@/common/dto/roles.decorator';
import { JwtAuthGuard, RolesGuard } from '@/core/jwt/jwt.guard';
import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { StudentBookingQueryDto } from '../dto/student-booking-query.dto';
import { UpdateStudentProfileDto } from '../dto/update-student-profile.dto';
import { StudentService } from '../services/student.service';

@ApiTags('Student')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@Controller('student')
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get authenticated student overview statistics' })
  getMyOverview(@CurrentUser() user: CurrentUserData) {
    return this.studentService.getMyOverview(user.userId);
  }

  @Get('bookings')
  @ApiOperation({
    summary:
      'Get bookings for authenticated student with optional status filter',
  })
  getMyBookings(
    @CurrentUser() user: CurrentUserData,
    @Query() query: StudentBookingQueryDto,
  ) {
    return this.studentService.getMyBookings(user.userId, query);
  }

  @Get('credits')
  @ApiOperation({ summary: 'Get authenticated student credit balance' })
  getMyCredits(@CurrentUser() user: CurrentUserData) {
    return this.studentService.getMyCredits(user.userId);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update authenticated student profile' })
  updateProfile(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateStudentProfileDto,
  ) {
    return this.studentService.updateProfile(user.userId, dto);
  }
}
