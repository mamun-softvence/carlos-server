import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MessageController } from './controllers/message.controller';
import { MessageGateway } from './message.gateway';
import { MessageSocketAuthService } from './services/message-socket-auth.service';
import { MessageService } from './services/message.service';

@Module({
  imports: [ConfigModule, JwtModule.register({})],
  controllers: [MessageController],
  providers: [MessageService, MessageSocketAuthService, MessageGateway],
  exports: [MessageService],
})
export class MessageModule {}
