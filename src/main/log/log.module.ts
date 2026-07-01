import { Module } from '@nestjs/common';
import { LogAdminController } from './controllers/log.admin.controller';
import { LogStudentController } from './controllers/log.student.controller';
import { LogTutorController } from './controllers/log.tutor.controller';
import { LogService } from './services/log.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [LogAdminController, LogStudentController, LogTutorController],
  providers: [LogService],
})
export class LogModule {}
