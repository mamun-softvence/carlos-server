import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { SessionSocketAuthService } from './services/session-socket-auth.service';
import { SessionService } from './services/session.service';
import { AuthenticatedSessionSocket } from './interfaces/session-socket.interface';

@WebSocketGateway({
  namespace: '/sessions',
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
    ],
    credentials: true,
  },
})
export class SessionChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(SessionChatGateway.name);

  constructor(
    private readonly socketAuthService: SessionSocketAuthService,
    private readonly sessionService: SessionService,
  ) {}

  afterInit(server: Server) {
    server.use((socket, next) => {
      void this.authenticateSocket(socket, next);
    });
  }

  handleConnection(client: AuthenticatedSessionSocket) {
    this.logger.debug(`Session socket connected: ${client.id}`);
  }

  async handleDisconnect(client: AuthenticatedSessionSocket) {
    await this.leaveCurrentSession(client);
  }

  @SubscribeMessage('join-session')
  async joinSession(
    @ConnectedSocket() client: AuthenticatedSessionSocket,
    @MessageBody() payload: { sessionId: string },
  ) {
    const user = this.getUserOrThrow(client);
    const session = await this.sessionService.getSessionDetails(
      user.userId,
      user.role,
      payload.sessionId,
    );

    if (client.data.sessionId && client.data.sessionId !== payload.sessionId) {
      await this.leaveCurrentSession(client);
    }

    client.data.sessionId = payload.sessionId;
    await client.join(this.getSessionRoom(payload.sessionId));

    client
      .to(this.getSessionRoom(payload.sessionId))
      .emit('session-user-joined', {
        sessionId: payload.sessionId,
        user: {
          id: user.userId,
          email: user.email,
          role: user.role,
        },
      });

    return {
      event: 'join-session',
      data: session.data,
    };
  }

  @SubscribeMessage('leave-session')
  async leaveSession(@ConnectedSocket() client: AuthenticatedSessionSocket) {
    const left = await this.leaveCurrentSession(client);

    return {
      event: 'leave-session',
      data: {
        left: Boolean(left),
        sessionId: left?.sessionId,
      },
    };
  }

  @SubscribeMessage('send-session-message')
  async sendSessionMessage(
    @ConnectedSocket() client: AuthenticatedSessionSocket,
    @MessageBody() payload: { sessionId: string; content: string },
  ) {
    const user = this.getUserOrThrow(client);
    const message = await this.sessionService.createSessionMessage(
      user.userId,
      user.role,
      payload.sessionId,
      payload.content,
    );

    this.server
      .to(this.getSessionRoom(payload.sessionId))
      .emit('session-message', message);

    return {
      event: 'send-session-message',
      data: message,
    };
  }

  private async authenticateSocket(
    socket: Socket,
    next: (err?: Error) => void,
  ) {
    try {
      const user = await this.socketAuthService.authenticate(socket);
      (socket as AuthenticatedSessionSocket).data.user = user;
      next();
    } catch (error) {
      next(error as Error);
    }
  }

  private getSessionRoom(sessionId: string) {
    return `session:${sessionId}`;
  }

  private getUserOrThrow(client: AuthenticatedSessionSocket) {
    if (!client.data.user) {
      throw new Error('Socket is not authenticated');
    }

    return client.data.user;
  }

  private async leaveCurrentSession(client: AuthenticatedSessionSocket) {
    const sessionId = client.data.sessionId;

    if (!sessionId) {
      return null;
    }

    await client.leave(this.getSessionRoom(sessionId));
    client.data.sessionId = undefined;

    client.to(this.getSessionRoom(sessionId)).emit('session-user-left', {
      sessionId,
      socketId: client.id,
      userId: client.data.user?.userId,
    });

    return { sessionId };
  }
}
