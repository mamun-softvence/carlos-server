import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { GoogleStrategy } from '@/core/jwt/google.strategy';
import { JwtStrategy } from '@/core/jwt/jwt.strategy';
import { MailService } from '@/common/mail/mail.service';

@Module({
  imports: [ConfigModule, PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, GoogleStrategy, JwtStrategy, MailService],
  exports: [AuthService],
})
export class AuthModule {}
