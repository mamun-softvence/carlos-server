import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  CurrentUserData,
} from '@/common/dto/current-user.decorator';
import { JwtAuthGuard, RolesGuard } from '@/core/jwt/jwt.guard';
import { SendSessionMessageDto } from './dto/send-session-message.dto';
import { SessionService } from './services/session.service';

@ApiTags('Live Sessions')
@ApiBearerAuth()
@Controller('sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get(':sessionId')
  @ApiOperation({ summary: 'Get live session details for an existing booking' })
  getSession(
    @CurrentUser() user: CurrentUserData,
    @Param('sessionId') sessionId: string,
  ) {
    return this.sessionService.getSessionDetails(
      user.userId,
      user.role,
      sessionId,
    );
  }

  @Post(':sessionId/agora-token')
  @ApiOperation({ summary: 'Generate an Agora RTC token for a live session' })
  createAgoraToken(
    @CurrentUser() user: CurrentUserData,
    @Param('sessionId') sessionId: string,
  ) {
    return this.sessionService.createAgoraToken(
      user.userId,
      user.role,
      sessionId,
    );
  }

  @Patch(':sessionId/start')
  @ApiOperation({ summary: 'Start a scheduled live session' })
  startSession(
    @CurrentUser() user: CurrentUserData,
    @Param('sessionId') sessionId: string,
  ) {
    return this.sessionService.startSession(user.userId, sessionId);
  }

  @Patch(':sessionId/end')
  @ApiOperation({ summary: 'End an active live session' })
  endSession(
    @CurrentUser() user: CurrentUserData,
    @Param('sessionId') sessionId: string,
  ) {
    return this.sessionService.endSession(user.userId, sessionId);
  }

  @Get(':sessionId/messages')
  @ApiOperation({ summary: 'Get persisted chat messages for a live session' })
  getMessages(
    @CurrentUser() user: CurrentUserData,
    @Param('sessionId') sessionId: string,
  ) {
    return this.sessionService.getSessionMessages(
      user.userId,
      user.role,
      sessionId,
    );
  }

  @Post(':sessionId/messages')
  @ApiOperation({ summary: 'Persist a chat message for a live session' })
  @ApiBody({ type: SendSessionMessageDto })
  createMessage(
    @CurrentUser() user: CurrentUserData,
    @Param('sessionId') sessionId: string,
    @Body() dto: SendSessionMessageDto,
  ) {
    return this.sessionService.createSessionMessage(
      user.userId,
      user.role,
      sessionId,
      dto.content,
    );
  }
}
