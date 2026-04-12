import { Module } from '@nestjs/common';
import { AdminController } from './controllers/admin.controller';
import { TutorAdminController } from './controllers/tutor.admin.controller';
import { AdminService } from './services/admin.service';
import { TutorAdminService } from './services/tutor.admin.service';

@Module({
  controllers: [AdminController, TutorAdminController],
  providers: [AdminService, TutorAdminService],
})
export class AdminModule {}
