import {
  CurrentUser,
  CurrentUserData,
} from '@/common/dto/current-user.decorator';
import { Roles } from '@/common/dto/roles.decorator';
import { JwtAuthGuard, RolesGuard } from '@/core/jwt/jwt.guard';
import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { TaskQueryDto } from '../dto/task-query.dto';
import { TaskService } from '../services/task.service';

@ApiTags('Student Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@Controller('student/tasks')
export class TaskStudentController {
  constructor(private readonly taskService: TaskService) {}

  @Get()
  @ApiOperation({ summary: 'Get assigned tasks for authenticated student' })
  getMyTasks(
    @CurrentUser() user: CurrentUserData,
    @Query() query: TaskQueryDto,
  ) {
    return this.taskService.getStudentTasks(user.userId, query);
  }

  @Get(':taskId')
  @ApiOperation({ summary: 'Open assigned task and get PDF URL' })
  getMyTask(
    @CurrentUser() user: CurrentUserData,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.taskService.getStudentTask(user.userId, taskId);
  }

  @Patch(':taskId/submit')
  @UseInterceptors(FileInterceptor('answerPdf'))
  @ApiOperation({ summary: 'Submit answer PDF for a task' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['answerPdf'],
      properties: {
        answerPdf: {
          type: 'string',
          format: 'binary',
          description: 'Student answer PDF file',
        },
      },
    },
  })
  submitTask(
    @CurrentUser() user: CurrentUserData,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @UploadedFile() answerPdf: Express.Multer.File,
  ) {
    return this.taskService.submitTask(user.userId, taskId, answerPdf);
  }
}
