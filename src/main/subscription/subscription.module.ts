import { Module } from '@nestjs/common';
import { SubscriptionAdminController } from './controllers/subscripton.admin.controller';
import { SubscriptionStudentController } from './controllers/subscripton.student.controller';
import { SubscriptionAdminService } from './services/subscripton.admin.service';
import { SubscriptionStudentService } from './services/subscripton.student.service';

@Module({
  controllers: [SubscriptionAdminController, SubscriptionStudentController],
  providers: [SubscriptionAdminService, SubscriptionStudentService],
})
export class SubscriptionModule {}
