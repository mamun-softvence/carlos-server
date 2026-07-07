import { Roles } from '@/common/dto/roles.decorator';
import { JwtAuthGuard, RolesGuard } from '@/core/jwt/jwt.guard';
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { BookingService } from '../services/booking.service';
import { StudentTutorSearchQueryDto } from '../dto/student-tutor-search-query.dto';
import { StudentTutorScheduleQueryDto } from '../dto/student-tutor-schedule-query.dto';

@ApiTags('Student Tutors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@Controller('student/tutors')
export class StudentTutorController {
  constructor(private readonly bookingService: BookingService) {}

  @Get('search')
  @ApiOperation({ summary: 'Search tutors by availability and relevance' })
  @ApiQuery({ type: StudentTutorSearchQueryDto })
  searchTutors(@Query() query: StudentTutorSearchQueryDto) {
    return this.bookingService.searchTutorsForStudent(query);
  }

  @Get(':tutorId/schedule')
  @ApiOperation({
    summary: 'Get public availability and scheduled blocks for a tutor',
  })
  @ApiQuery({ type: StudentTutorScheduleQueryDto })
  getTutorSchedule(
    @Param('tutorId') tutorId: string,
    @Query() query: StudentTutorScheduleQueryDto,
  ) {
    return this.bookingService.getTutorScheduleForStudent(tutorId, query);
  }
}
