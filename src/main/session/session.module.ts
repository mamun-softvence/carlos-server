import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { SessionController } from './session.controller';
import { SessionChatGateway } from './session-chat.gateway';
import { SessionSocketAuthService } from './services/session-socket-auth.service';
import { SessionService } from './services/session.service';

@Module({
  imports: [ConfigModule, JwtModule.register({})],
  controllers: [SessionController],
  providers: [SessionService, SessionSocketAuthService, SessionChatGateway],
  exports: [SessionService],
})
export class SessionModule {}
