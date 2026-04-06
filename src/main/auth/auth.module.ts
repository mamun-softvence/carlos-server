import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { GoogleStrategy } from '@/core/jwt/google.strategy';
import { MailService } from '@/common/mail/mail.service';

@Module({
  imports: [ConfigModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService,GoogleStrategy, MailService],
  exports: [AuthService],
})
export class AuthModule {}
