import { Roles } from '@/common/dto/roles.decorator';
import { JwtAuthGuard, RolesGuard } from '@/core/jwt/jwt.guard';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { UpdateStudentMarkDto } from '../dto/update-student-mark.dto';
import { LogService } from '../services/log.service';

@ApiTags('Admin Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/logs')
export class LogAdminController {
  constructor(private readonly logService: LogService) {}

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
