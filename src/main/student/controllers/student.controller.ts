import {
  CurrentUser,
  CurrentUserData,
} from '@/common/dto/current-user.decorator';
import { Roles } from '@/common/dto/roles.decorator';
import { JwtAuthGuard, RolesGuard } from '@/core/jwt/jwt.guard';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { StudentService } from '../services/student.service';

@ApiTags('Student')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@Controller('student')
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  @Get('bookings')
  @ApiOperation({ summary: 'Get all bookings for authenticated student' })
  getMyBookings(@CurrentUser() user: CurrentUserData) {
    return this.studentService.getMyBookings(user.userId);
  }
}
