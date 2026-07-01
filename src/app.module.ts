import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './main/auth/auth.module';
import { PrismaModule } from './lib/prisma/prisma.module';
import { AdminModule } from './main/admin/admin.module';
import { BookingModule } from './main/booking/booking.module';
import { UserModule } from './main/user.module';
import { StudentModule } from './main/student/student.module';
import { TutorModule } from './main/tutor/tutor.module';
import { SubscriptionModule } from './main/subscription/subscription.module';
import { SessionModule } from './main/session/session.module';
import { LogModule } from './main/log/log.module';
import { TaskModule } from './main/task/task.module';
import { MessageModule } from './main/message/message.module';
import { NotificationModule } from './main/notification/notification.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    BookingModule,
    AdminModule,
    UserModule,
    StudentModule,
    TutorModule,
    SubscriptionModule,
    SessionModule,
    LogModule,
    TaskModule,
    MessageModule,
    NotificationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
