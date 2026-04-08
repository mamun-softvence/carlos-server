import { Module } from '@nestjs/common';
import { TutorAdminController } from './controllers/tutor.admin.controller';
import { TutorAdminService } from './services/tutor.admin.service';

@Module({
  controllers: [TutorAdminController],
  providers: [TutorAdminService],
})
export class AdminModule {}
