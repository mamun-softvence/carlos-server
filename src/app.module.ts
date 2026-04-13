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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
