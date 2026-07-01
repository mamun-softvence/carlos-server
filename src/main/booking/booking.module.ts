import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { BookingService } from './services/booking.service';
import { BookingAdminController } from './controllers/booking.admin.controller';
import { BookingTutorController } from './controllers/booking.tutor.controller';
import { BookingStudentController } from './controllers/booking.student.controller';
import { BookingCommonController } from './controllers/booking.common.controller';
import { NotificationModule } from '../notification/notification.module';
import { MediaRoomManagerService } from './services/media-room-manager.service';
import { BookingLiveClassGateway } from './booking-live-class.gateway';
import { LiveClassSocketAuthService } from './services/live-class-socket-auth.service';

@Module({
  imports: [ConfigModule, JwtModule.register({}), NotificationModule],
  providers: [
    BookingService,
    MediaRoomManagerService,
    BookingLiveClassGateway,
    LiveClassSocketAuthService,
  ],
  controllers: [
    BookingAdminController,
    BookingTutorController,
    BookingStudentController,
    BookingCommonController,
  ],
})
export class BookingModule {}
