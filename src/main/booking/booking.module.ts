import { Module } from '@nestjs/common';
import { BookingService } from './services/booking.service';
import { BookingAdminController } from './controllers/booking.admin.controller';
import { BookingTutorController } from './controllers/booking.tutor.controller';
import { BookingStudentController } from './controllers/booking.student.controller';
import { BookingCommonController } from './controllers/booking.common.controller';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [NotificationModule],
  providers: [BookingService],
  controllers: [
    BookingAdminController,
    BookingTutorController,
    BookingStudentController,
    BookingCommonController,
  ],
})
export class BookingModule {}
