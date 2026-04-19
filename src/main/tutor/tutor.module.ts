import { Module } from '@nestjs/common';
import { TutorController } from './controllers/tutor.controller';
import { TutorService } from './services/tutor.service';

@Module({
  controllers: [TutorController],
  providers: [TutorService],
})
export class TutorModule {}
