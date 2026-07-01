import {
  CurrentUser,
  CurrentUserData,
} from '@/common/dto/current-user.decorator';
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

@ApiTags('Tutor Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TUTOR)
@Controller('tutor/logs')
export class LogTutorController {
  constructor(private readonly logService: LogService) {}

  @Get('students/:studentId')
  @ApiOperation({ summary: 'Get tutor log for a student' })
  getTutorStudentLog(
    @CurrentUser() user: CurrentUserData,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.logService.getTutorStudentLog(studentId, user.userId);
  }

  @Patch('students/:studentId/mark')
  @ApiOperation({ summary: 'Create or update student competency marks' })
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
    @CurrentUser() user: CurrentUserData,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: UpdateStudentMarkDto,
  ) {
    return this.logService.upsertStudentMark(studentId, user.userId, dto);
  }
}
