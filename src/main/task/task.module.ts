import { Module } from '@nestjs/common';
import { TaskAdminController } from './controllers/task.admin.controller';
import { TaskStudentController } from './controllers/task.student.controller';
import { TaskTutorController } from './controllers/task.tutor.controller';
import { TaskService } from './services/task.service';

@Module({
  controllers: [
    TaskTutorController,
    TaskStudentController,
    TaskAdminController,
  ],
  providers: [TaskService],
})
export class TaskModule {}
