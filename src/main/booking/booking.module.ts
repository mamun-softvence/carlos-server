import { Module } from '@nestjs/common';
import { BookingService } from './booking.service';
import { BookingAdminController } from './booking.admin.controller';
import { BookingTutorController } from './booking.tutor.controller';
import { BookingStudentController } from './booking.student.controller';

@Module({
  providers: [BookingService],
  controllers: [
    BookingAdminController,
    BookingTutorController,
    BookingStudentController,
  ],
})
export class BookingModule {}
