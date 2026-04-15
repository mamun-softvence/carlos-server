import { Module } from '@nestjs/common';
import { SubscriptionAdminController } from './controllers/subscripton.admin.controller';
import { SubscriptionAdminService } from './services/subscripton.admin.service';

@Module({
  controllers: [SubscriptionAdminController],
  providers: [SubscriptionAdminService],
})
export class SubscriptionModule {}
