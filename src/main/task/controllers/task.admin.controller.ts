import {
  CurrentUser,
  CurrentUserData,
} from '@/common/dto/current-user.decorator';
import { Roles } from '@/common/dto/roles.decorator';
import { JwtAuthGuard, RolesGuard } from '@/core/jwt/jwt.guard';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { TaskQueryDto } from '../dto/task-query.dto';
import { TaskService } from '../services/task.service';

@ApiTags('Admin Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/tasks')
export class TaskAdminController {
  constructor(private readonly taskService: TaskService) {}

  @Get()
  @ApiOperation({ summary: 'Get all assigned tasks' })
  getAllTasks(
    @CurrentUser() user: CurrentUserData,
    @Query() query: TaskQueryDto,
  ) {
    return this.taskService.getAdminTasks(user.userId, query);
  }
}
