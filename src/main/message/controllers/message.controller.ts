import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  CurrentUserData,
} from '@/common/dto/current-user.decorator';
import { JwtAuthGuard, RolesGuard } from '@/core/jwt/jwt.guard';
import { CreateDirectConversationDto } from '../dto/create-direct-conversation.dto';
import { MessageQueryDto } from '../dto/message-query.dto';
import { SendDirectMessageDto } from '../dto/send-direct-message.dto';
import { SendMessageDto } from '../dto/send-message.dto';
import { MessageService } from '../services/message.service';

@ApiTags('Messages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('messages')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Get('contacts')
  @ApiOperation({ summary: 'Get users the authenticated user can message' })
  getContacts(@CurrentUser() user: CurrentUserData) {
    return this.messageService.getContacts(user.userId);
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Get authenticated user message conversations' })
  getConversations(
    @CurrentUser() user: CurrentUserData,
    @Query() query: MessageQueryDto,
  ) {
    return this.messageService.getConversations(user.userId, query);
  }

  @Post('conversations/direct')
  @ApiOperation({
    summary: 'Create or fetch a direct message conversation',
  })
  @ApiBody({ type: CreateDirectConversationDto })
  createDirectConversation(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateDirectConversationDto,
  ) {
    return this.messageService.createDirectConversation(
      user.userId,
      dto.receiverId,
    );
  }

  @Post('direct')
  @ApiOperation({
    summary: 'Send a direct message, creating the conversation if needed',
  })
  @ApiBody({ type: SendDirectMessageDto })
  sendDirectMessage(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: SendDirectMessageDto,
  ) {
    return this.messageService.sendDirectMessage(
      user.userId,
      dto.receiverId,
      dto.content,
    );
  }

  @Get('conversations/:conversationId')
  @ApiOperation({ summary: 'Get one message conversation' })
  getConversation(
    @CurrentUser() user: CurrentUserData,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
  ) {
    return this.messageService.getConversation(user.userId, conversationId);
  }

  @Get('conversations/:conversationId/messages')
  @ApiOperation({ summary: 'Get messages in a conversation' })
  getMessages(
    @CurrentUser() user: CurrentUserData,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Query() query: MessageQueryDto,
  ) {
    return this.messageService.getMessages(user.userId, conversationId, query);
  }

  @Post('conversations/:conversationId/messages')
  @ApiOperation({ summary: 'Send a message in an existing conversation' })
  @ApiBody({ type: SendMessageDto })
  sendConversationMessage(
    @CurrentUser() user: CurrentUserData,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messageService.sendConversationMessage(
      user.userId,
      conversationId,
      dto.content,
    );
  }
}
