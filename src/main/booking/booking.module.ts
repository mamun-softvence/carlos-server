import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { BookingService } from './services/booking.service';
import { TutorScheduleService } from './services/tutor-schedule.service';
import { BookingSchedulerService } from './services/booking-scheduler.service';
import { BookingAdminController } from './controllers/booking.admin.controller';
import { BookingTutorController } from './controllers/booking.tutor.controller';
import { BookingStudentController } from './controllers/booking.student.controller';
import { BookingCommonController } from './controllers/booking.common.controller';
import { TutorScheduleController } from './controllers/tutor-schedule.controller';
import { StudentAvailabilityController } from './controllers/student-availability.controller';
import { StudentTutorController } from './controllers/student-tutor.controller';
import { NotificationModule } from '../notification/notification.module';
import { GoogleCalendarModule } from '../google-calendar/google-calendar.module';
import { MediaRoomManagerService } from './services/media-room-manager.service';
import { BookingLiveClassGateway } from './booking-live-class.gateway';
import { LiveClassSocketAuthService } from './services/live-class-socket-auth.service';

@Module({
  imports: [
    ConfigModule,
    JwtModule.register({}),
    NotificationModule,
    GoogleCalendarModule,
    ScheduleModule.forRoot(),
  ],
  providers: [
    BookingService,
    TutorScheduleService,
    BookingSchedulerService,
    MediaRoomManagerService,
    BookingLiveClassGateway,
    LiveClassSocketAuthService,
  ],
  controllers: [
    BookingAdminController,
    BookingTutorController,
    BookingStudentController,
    BookingCommonController,
    TutorScheduleController,
    StudentAvailabilityController,
    StudentTutorController,
  ],
})
export class BookingModule {}
