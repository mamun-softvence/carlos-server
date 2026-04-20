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
import { UserRole } from '@prisma/client';
import { BookingService } from './services/booking.service';
import { LiveClassSocketAuthService } from './services/live-class-socket-auth.service';
import {
  LiveClassParticipantPresence,
  MediaRoomManagerService,
} from './services/media-room-manager.service';

type AuthenticatedSocketData = {
  user?: {
    userId: string;
    email: string;
    role: UserRole;
    sub: string;
  };
  classSessionId?: string;
  statusClassSessionId?: string;
};

interface AuthenticatedSocket extends Socket {
  data: AuthenticatedSocketData;
}

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
    server.use((socket, next) => {
      void this.authenticateSocket(socket, next);
    });
  }

  private async authenticateSocket(
    socket: Socket,
    next: (err?: Error) => void,
  ) {
    try {
      const user = await this.socketAuthService.authenticate(socket);
      (socket as AuthenticatedSocket).data.user = user;
      next();
    } catch (error) {
      next(error as Error);
    }
  }

  handleConnection(client: AuthenticatedSocket) {
    this.logger.debug(`Socket connected: ${client.id}`);
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    await this.leaveCurrentClass(client);

    if (client.data.statusClassSessionId) {
      await client.leave(this.getStatusRoom(client.data.statusClassSessionId));
      client.data.statusClassSessionId = undefined;
    }
  }

  private getSocketRoom(classSessionId: string) {
    return `live-class:${classSessionId}`;
  }

  private getStatusRoom(classSessionId: string) {
    return `live-class-status:${classSessionId}`;
  }

  private getUserOrThrow(client: AuthenticatedSocket) {
    if (!client.data.user) {
      throw new Error('Socket is not authenticated');
    }

    return client.data.user;
  }

  private toParticipantUser(
    user: NonNullable<AuthenticatedSocket['data']['user']>,
  ) {
    return {
      id: user.userId,
      name: null,
      email: user.email,
      avatarUrl: null,
    };
  }

  private emitClassStatusUpdated(classSessionId: string, liveClass: unknown) {
    this.server
      .to(this.getSocketRoom(classSessionId))
      .to(this.getStatusRoom(classSessionId))
      .emit('class-status-updated', liveClass);
  }

  private emitParticipantJoined(
    classSessionId: string,
    participant: LiveClassParticipantPresence,
  ) {
    this.server
      .to(this.getSocketRoom(classSessionId))
      .to(this.getStatusRoom(classSessionId))
      .emit('participant-joined', {
        classSessionId,
        participant,
      });
  }

  private emitParticipantLeft(
    classSessionId: string,
    participant: LiveClassParticipantPresence,
  ) {
    this.server
      .to(this.getSocketRoom(classSessionId))
      .to(this.getStatusRoom(classSessionId))
      .emit('participant-left', {
        classSessionId,
        participantId: participant.participantId,
        userId: participant.userId,
        socketId: participant.socketId,
      });
  }

  private emitParticipantsUpdated(classSessionId: string) {
    const participants = this.mediaRoomManager.getParticipants(classSessionId);

    this.server
      .to(this.getSocketRoom(classSessionId))
      .to(this.getStatusRoom(classSessionId))
      .emit('participants-updated', {
        classSessionId,
        participants,
      });

    return participants;
  }

  private async leaveCurrentClass(client: AuthenticatedSocket) {
    const classSessionId = client.data.classSessionId;

    if (!classSessionId) {
      return null;
    }

    const participant = this.mediaRoomManager.closePeer(
      classSessionId,
      client.id,
    );

    await client.leave(this.getSocketRoom(classSessionId));
    await client.leave(this.getStatusRoom(classSessionId));
    client.data.classSessionId = undefined;

    if (client.data.statusClassSessionId === classSessionId) {
      client.data.statusClassSessionId = undefined;
    }

    if (participant) {
      this.emitParticipantLeft(classSessionId, participant);
      this.emitParticipantsUpdated(classSessionId);
    }

    return {
      classSessionId,
      participant,
    };
  }

  @SubscribeMessage('join-class')
  async joinClass(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { classSessionId: string },
  ) {
    const user = this.getUserOrThrow(client);

    if (
      client.data.classSessionId &&
      client.data.classSessionId !== payload.classSessionId
    ) {
      await this.leaveCurrentClass(client);
    }

    const liveClass = await this.bookingService.assertCanJoinLiveClass(
      user.userId,
      user.role,
      payload.classSessionId,
    );

    const participant = await this.mediaRoomManager.registerPeer(
      payload.classSessionId,
      client.id,
      user.userId,
      user.role,
      this.toParticipantUser(user),
    );

    client.data.classSessionId = payload.classSessionId;
    await client.join(this.getSocketRoom(payload.classSessionId));
    await client.join(this.getStatusRoom(payload.classSessionId));

    this.emitParticipantJoined(payload.classSessionId, participant);
    const participants = this.emitParticipantsUpdated(payload.classSessionId);

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
        participants,
      },
    };
  }

  @SubscribeMessage('leave-class')
  async leaveClass(@ConnectedSocket() client: AuthenticatedSocket) {
    const left = await this.leaveCurrentClass(client);

    if (!left?.classSessionId) {
      return { event: 'leave-class', data: { left: false } };
    }

    return {
      event: 'leave-class',
      data: {
        left: true,
        classSessionId: left.classSessionId,
        participant: left.participant,
      },
    };
  }

  private async watchClass(
    client: AuthenticatedSocket,
    payload: { classSessionId: string },
    event: string,
  ) {
    const user = this.getUserOrThrow(client);
    const liveClass = await this.bookingService.getLiveClassByBookingId(
      user.userId,
      user.role,
      payload.classSessionId,
    );

    if (
      client.data.statusClassSessionId &&
      client.data.statusClassSessionId !== payload.classSessionId
    ) {
      await client.leave(this.getStatusRoom(client.data.statusClassSessionId));
    }

    client.data.statusClassSessionId = payload.classSessionId;
    await client.join(this.getStatusRoom(payload.classSessionId));

    return {
      event,
      data: {
        classSessionId: payload.classSessionId,
        liveClass: liveClass.data,
        participants: this.mediaRoomManager.getParticipants(
          payload.classSessionId,
        ),
      },
    };
  }

  @SubscribeMessage('subscribe-class')
  async subscribeClass(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { classSessionId: string },
  ) {
    return this.watchClass(client, payload, 'subscribe-class');
  }

  @SubscribeMessage('status-watch')
  async statusWatch(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { classSessionId: string },
  ) {
    return this.watchClass(client, payload, 'status-watch');
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

    this.emitClassStatusUpdated(payload.classSessionId, liveClass);

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

    this.emitClassStatusUpdated(payload.classSessionId, liveClass);

    this.mediaRoomManager.closeRoom(payload.classSessionId);
    this.emitParticipantsUpdated(payload.classSessionId);
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

    client.to(this.getSocketRoom(payload.classSessionId)).emit('new-producer', {
      classSessionId: payload.classSessionId,
      producerId: producer.id,
      kind: producer.kind,
      participant: this.mediaRoomManager.getParticipant(
        payload.classSessionId,
        client.id,
      ),
    });

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
