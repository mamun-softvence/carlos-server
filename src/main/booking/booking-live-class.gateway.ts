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
import { Logger, UseFilters } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { UserRole } from '@prisma/client';
import { BookingService } from './services/booking.service';
import { LiveClassSocketAuthService } from './services/live-class-socket-auth.service';
import { MediaRoomManagerService } from './services/media-room-manager.service';

type AuthenticatedSocket = Socket & {
  data: {
    user?: {
      userId: string;
      email: string;
      role: UserRole;
      sub: string;
    };
    classSessionId?: string;
  };
};

@WebSocketGateway({
  namespace: '/live-classes',
  cors: {
    origin: '*',
  },
})
export class BookingLiveClassGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(BookingLiveClassGateway.name);

  constructor(
    private readonly bookingService: BookingService,
    private readonly socketAuthService: LiveClassSocketAuthService,
    private readonly mediaRoomManager: MediaRoomManagerService,
  ) {}

  afterInit(server: Server) {
    server.use(async (socket, next) => {
      try {
        const user = await this.socketAuthService.authenticate(socket);
        (socket as AuthenticatedSocket).data.user = user;
        next();
      } catch (error) {
        next(error as Error);
      }
    });
  }

  handleConnection(client: AuthenticatedSocket) {
    this.logger.debug(`Socket connected: ${client.id}`);
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    if (client.data.classSessionId) {
      await this.mediaRoomManager.closePeer(
        client.data.classSessionId,
        client.id,
      );
      client.leave(this.getSocketRoom(client.data.classSessionId));
    }
  }

  private getSocketRoom(classSessionId: string) {
    return `live-class:${classSessionId}`;
  }

  private getUserOrThrow(client: AuthenticatedSocket) {
    if (!client.data.user) {
      throw new Error('Socket is not authenticated');
    }

    return client.data.user;
  }

  @SubscribeMessage('join-class')
  async joinClass(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { classSessionId: string },
  ) {
    const user = this.getUserOrThrow(client);
    const liveClass = await this.bookingService.assertCanJoinLiveClass(
      user.userId,
      user.role,
      payload.classSessionId,
    );

    await this.mediaRoomManager.registerPeer(
      payload.classSessionId,
      client.id,
      user.userId,
      user.role,
    );

    client.data.classSessionId = payload.classSessionId;
    client.join(this.getSocketRoom(payload.classSessionId));

    return {
      event: 'join-class',
      data: {
        classSessionId: payload.classSessionId,
        liveClass,
        routerRtpCapabilities:
          await this.mediaRoomManager.getRouterRtpCapabilities(
            payload.classSessionId,
          ),
        producerIds: this.mediaRoomManager.getProducerIds(
          payload.classSessionId,
          client.id,
        ),
      },
    };
  }

  @SubscribeMessage('leave-class')
  async leaveClass(@ConnectedSocket() client: AuthenticatedSocket) {
    const classSessionId = client.data.classSessionId;

    if (!classSessionId) {
      return { event: 'leave-class', data: { left: false } };
    }

    await this.mediaRoomManager.closePeer(classSessionId, client.id);
    client.leave(this.getSocketRoom(classSessionId));
    client.data.classSessionId = undefined;

    return { event: 'leave-class', data: { left: true } };
  }

  @SubscribeMessage('start-class')
  async startClass(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { classSessionId: string },
  ) {
    const user = this.getUserOrThrow(client);
    const liveClass = await this.bookingService.startLiveClass(
      user.userId,
      payload.classSessionId,
    );

    this.server
      .to(this.getSocketRoom(payload.classSessionId))
      .emit('class-status-updated', liveClass);

    return { event: 'start-class', data: liveClass };
  }

  @SubscribeMessage('end-class')
  async endClass(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { classSessionId: string },
  ) {
    const user = this.getUserOrThrow(client);
    const liveClass = await this.bookingService.endLiveClass(
      user.userId,
      payload.classSessionId,
    );

    this.server
      .to(this.getSocketRoom(payload.classSessionId))
      .emit('class-status-updated', liveClass);

    await this.mediaRoomManager.closeRoom(payload.classSessionId);
    return { event: 'end-class', data: liveClass };
  }

  @SubscribeMessage('send-message')
  async sendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { classSessionId: string; message: string },
  ) {
    const user = this.getUserOrThrow(client);
    const message = await this.bookingService.createLiveClassMessage(
      user.userId,
      user.role,
      payload.classSessionId,
      payload.message,
    );

    this.server
      .to(this.getSocketRoom(payload.classSessionId))
      .emit('receive-message', message);

    return { event: 'send-message', data: message };
  }

  @SubscribeMessage('create-transport')
  async createTransport(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { classSessionId: string },
  ) {
    const user = this.getUserOrThrow(client);
    await this.bookingService.assertCanJoinLiveClass(
      user.userId,
      user.role,
      payload.classSessionId,
    );

    return {
      event: 'create-transport',
      data: await this.mediaRoomManager.createWebRtcTransport(
        payload.classSessionId,
        client.id,
      ),
    };
  }

  @SubscribeMessage('connect-transport')
  async connectTransport(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    payload: {
      classSessionId: string;
      transportId: string;
      dtlsParameters: unknown;
    },
  ) {
    await this.mediaRoomManager.connectTransport(
      payload.classSessionId,
      client.id,
      payload.transportId,
      payload.dtlsParameters as never,
    );

    return { event: 'connect-transport', data: { connected: true } };
  }

  @SubscribeMessage('produce')
  async produce(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    payload: {
      classSessionId: string;
      transportId: string;
      kind: 'audio' | 'video';
      rtpParameters: unknown;
      appData?: Record<string, unknown>;
    },
  ) {
    const producer = await this.mediaRoomManager.produce(
      payload.classSessionId,
      client.id,
      payload.transportId,
      {
        kind: payload.kind,
        rtpParameters: payload.rtpParameters as never,
        appData: payload.appData,
      },
    );

    client
      .to(this.getSocketRoom(payload.classSessionId))
      .emit('new-producer', { producerId: producer.id, kind: producer.kind });

    return {
      event: 'produce',
      data: {
        producerId: producer.id,
        kind: producer.kind,
      },
    };
  }

  @SubscribeMessage('consume')
  async consume(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    payload: {
      classSessionId: string;
      transportId: string;
      producerId: string;
      rtpCapabilities: unknown;
    },
  ) {
    const consumer = await this.mediaRoomManager.consume(
      payload.classSessionId,
      client.id,
      payload.transportId,
      payload.producerId,
      payload.rtpCapabilities as never,
    );

    return {
      event: 'consume',
      data: {
        id: consumer.id,
        producerId: consumer.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      },
    };
  }
}
