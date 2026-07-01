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
  Post,
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
import { CreateTaskDto } from '../dto/create-task.dto';
import { TaskQueryDto } from '../dto/task-query.dto';
import { TaskService } from '../services/task.service';

@ApiTags('Tutor Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TUTOR)
@Controller('tutor/tasks')
export class TaskTutorController {
  constructor(private readonly taskService: TaskService) {}

  @Post()
  @UseInterceptors(FileInterceptor('pdf'))
  @ApiOperation({ summary: 'Assign task/homework to a student' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['bookingId', 'studentId', 'title', 'dueDate', 'pdf'],
      properties: {
        bookingId: {
          type: 'string',
          example: '97d4ed15-48ab-4e9f-bb46-39561d49513d',
          description: 'Scheduled booking this task belongs to',
        },
        studentId: {
          type: 'string',
          example: '4b572b45-238e-4011-b3e2-da75fb7a0a44',
          description:
            'Student in the scheduled booking who receives this task',
        },
        title: {
          type: 'string',
          example: 'Algebra worksheet 01',
        },
        dueDate: {
          type: 'string',
          format: 'date-time',
          example: '2026-04-30T18:00:00.000Z',
        },
        pdf: {
          type: 'string',
          format: 'binary',
          description: 'Task/homework PDF file',
        },
      },
    },
  })
  createTask(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateTaskDto,
    @UploadedFile() pdf: Express.Multer.File,
  ) {
    return this.taskService.createTask(user.userId, dto, pdf);
  }

  @Get()
  @ApiOperation({ summary: 'Get tasks assigned by authenticated tutor' })
  getMyTasks(
    @CurrentUser() user: CurrentUserData,
    @Query() query: TaskQueryDto,
  ) {
    return this.taskService.getTutorTasks(user.userId, query);
  }
}
