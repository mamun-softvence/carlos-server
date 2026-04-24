import {
  CurrentUser,
  CurrentUserData,
} from '@/common/dto/current-user.decorator';
import { Roles } from '@/common/dto/roles.decorator';
import { JwtAuthGuard, RolesGuard } from '@/core/jwt/jwt.guard';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { LogService } from '../services/log.service';

@ApiTags('Student Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@Controller('student/logs')
export class LogStudentController {
  constructor(private readonly logService: LogService) {}

  @Get()
  @ApiOperation({ summary: 'Get authenticated student logs' })
  getMyLogs(@CurrentUser() user: CurrentUserData) {
    return this.logService.getStudentLogsByStudent(user.userId);
  }
}
