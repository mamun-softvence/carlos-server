import { Roles } from '@/common/dto/roles.decorator';
import { JwtAuthGuard, RolesGuard } from '@/core/jwt/jwt.guard';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AdminStudentLogQueryDto } from '../dto/admin-student-log-query.dto';
import { UpdateStudentMarkDto } from '../dto/update-student-mark.dto';
import { LogService } from '../services/log.service';

@ApiTags('Admin Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/logs')
export class LogAdminController {
  constructor(private readonly logService: LogService) {}

  @Get('students/:studentId/overview')
  @ApiOperation({ summary: 'Get admin student overview' })
  getStudentOverview(@Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.logService.getAdminStudentOverview(studentId);
  }

  @Get('students/:studentId/profile')
  @ApiOperation({ summary: 'Get admin student profile details' })
  getStudentProfile(@Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.logService.getAdminStudentProfile(studentId);
  }

  @Get('students/:studentId/logs')
  @ApiOperation({ summary: 'Get student competency logs' })
  getStudentLogs(@Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.logService.getStudentLogsByStudent(studentId);
  }

  @Get('students/:studentId/bookings')
  @ApiOperation({ summary: 'Get student booking history' })
  getStudentBookingHistory(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() query: AdminStudentLogQueryDto,
  ) {
    return this.logService.getAdminStudentBookingHistory(studentId, query);
  }

  @Get('students/:studentId/upcoming-classes')
  @ApiOperation({ summary: 'Get student upcoming classes' })
  getStudentUpcomingClasses(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() query: AdminStudentLogQueryDto,
  ) {
    return this.logService.getAdminStudentUpcomingClasses(studentId, query);
  }

  @Get('students/:studentId/transactions')
  @ApiOperation({ summary: 'Get student transaction history' })
  getStudentTransactionHistory(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() query: AdminStudentLogQueryDto,
  ) {
    return this.logService.getAdminStudentTransactionHistory(studentId, query);
  }

  @Get('students/:studentId/tutors')
  @ApiOperation({ summary: 'Get tutors assigned to a student' })
  getStudentAssignedTutors(
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.logService.getAdminStudentAssignedTutors(studentId);
  }

  @Get('students/:studentId')
  @ApiOperation({ summary: 'Get logs by student' })
  getStudentLogsByStudent(
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.logService.getStudentLogsByStudent(studentId);
  }

  @Patch('students/:studentId/tutors/:tutorId/mark')
  @ApiOperation({ summary: 'Create or update student marks' })
  @ApiBody({
    type: UpdateStudentMarkDto,
    examples: {
      updateStudentMark: {
        summary: 'Update student marks',
        value: {
          input: 4,
          output: 4,
          architecture: 4,
          lexicon: 4,
          dynamics: 4,
        },
      },
    },
  })
  updateStudentMark(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('tutorId', ParseUUIDPipe) tutorId: string,
    @Body() dto: UpdateStudentMarkDto,
  ) {
    return this.logService.upsertStudentMark(studentId, tutorId, dto);
  }
}
