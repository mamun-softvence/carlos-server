import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthenticatedMessageSocket } from './interfaces/message-socket.interface';
import { MessageSocketAuthService } from './services/message-socket-auth.service';
import { MessageService } from './services/message.service';

@WebSocketGateway({
  namespace: '/messages',
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
    ],
    credentials: true,
  },
})
export class MessageGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(MessageGateway.name);

  constructor(
    private readonly socketAuthService: MessageSocketAuthService,
    private readonly messageService: MessageService,
  ) {}

  afterInit(server: Server) {
    server.use((socket, next) => {
      void this.authenticateSocket(socket, next);
    });
  }

  async handleConnection(client: AuthenticatedMessageSocket) {
    const user = this.getUserOrThrow(client);
    await client.join(this.getUserRoom(user.userId));
    this.logger.debug(`Message socket connected: ${client.id}`);
  }

  async handleDisconnect(client: AuthenticatedMessageSocket) {
    await this.leaveCurrentConversation(client);
  }

  @SubscribeMessage('join-conversation')
  async joinConversation(
    @ConnectedSocket() client: AuthenticatedMessageSocket,
    @MessageBody() payload: { conversationId: string },
  ) {
    const user = this.getUserOrThrow(client);

    if (!payload.conversationId) {
      throw new WsException('conversationId is required');
    }

    const conversation = await this.messageService.getConversation(
      user.userId,
      payload.conversationId,
    );

    if (
      client.data.conversationId &&
      client.data.conversationId !== payload.conversationId
    ) {
      await this.leaveCurrentConversation(client);
    }

    client.data.conversationId = payload.conversationId;
    await client.join(this.getConversationRoom(payload.conversationId));

    return {
      event: 'join-conversation',
      data: conversation.data,
    };
  }

  @SubscribeMessage('leave-conversation')
  async leaveConversation(
    @ConnectedSocket() client: AuthenticatedMessageSocket,
  ) {
    const left = await this.leaveCurrentConversation(client);

    return {
      event: 'leave-conversation',
      data: {
        left: Boolean(left),
        conversationId: left?.conversationId,
      },
    };
  }

  @SubscribeMessage('send-message')
  async sendMessage(
    @ConnectedSocket() client: AuthenticatedMessageSocket,
    @MessageBody()
    payload: { conversationId?: string; receiverId?: string; content: string },
  ) {
    const user = this.getUserOrThrow(client);

    if (payload.conversationId) {
      const response = await this.messageService.sendConversationMessage(
        user.userId,
        payload.conversationId,
        payload.content,
      );

      this.emitMessage(response.data);

      return {
        event: 'send-message',
        data: response.data,
      };
    }

    if (payload.receiverId) {
      const response = await this.messageService.sendDirectMessage(
        user.userId,
        payload.receiverId,
        payload.content,
      );

      this.emitMessage(response.data.message);

      return {
        event: 'send-message',
        data: response.data,
      };
    }

    throw new WsException('conversationId or receiverId is required');
  }

  private emitMessage(message: {
    conversationId: string;
    participantIds?: string[];
  }) {
    const rooms = [
      this.getConversationRoom(message.conversationId),
      ...(message.participantIds ?? []).map((participantId) =>
        this.getUserRoom(participantId),
      ),
    ];

    this.server.to(rooms).emit('message', message);
  }

  private async authenticateSocket(
    socket: Socket,
    next: (err?: Error) => void,
  ) {
    try {
      const user = await this.socketAuthService.authenticate(socket);
      (socket as AuthenticatedMessageSocket).data.user = user;
      next();
    } catch (error) {
      next(error as Error);
    }
  }

  private getConversationRoom(conversationId: string) {
    return `conversation:${conversationId}`;
  }

  private getUserRoom(userId: string) {
    return `user:${userId}`;
  }

  private getUserOrThrow(client: AuthenticatedMessageSocket) {
    if (!client.data.user) {
      throw new WsException('Socket is not authenticated');
    }

    return client.data.user;
  }

  private async leaveCurrentConversation(client: AuthenticatedMessageSocket) {
    const conversationId = client.data.conversationId;

    if (!conversationId) {
      return null;
    }

    await client.leave(this.getConversationRoom(conversationId));
    client.data.conversationId = undefined;

    return { conversationId };
  }
}
