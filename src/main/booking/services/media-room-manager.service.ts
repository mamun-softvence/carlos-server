import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import * as mediasoup from 'mediasoup';
import { UserRole } from '@prisma/client';
import { PrismaService } from '@/lib/prisma/prisma.service';

type MediasoupWorker = Awaited<ReturnType<typeof mediasoup.createWorker>>;
type MediasoupRouter = Awaited<ReturnType<MediasoupWorker['createRouter']>>;
type MediasoupWebRtcTransport = Awaited<
  ReturnType<MediasoupRouter['createWebRtcTransport']>
>;
type MediasoupProducer = Awaited<
  ReturnType<MediasoupWebRtcTransport['produce']>
>;
type MediasoupConsumer = Awaited<
  ReturnType<MediasoupWebRtcTransport['consume']>
>;
type RouterMediaCodec = {
  kind: 'audio' | 'video';
  mimeType: string;
  clockRate: number;
  channels?: number;
  parameters?: Record<string, unknown>;
};
type RtpCapabilities = Parameters<
  MediasoupRouter['canConsume']
>[0]['rtpCapabilities'];
type DtlsParameters = Parameters<
  MediasoupWebRtcTransport['connect']
>[0]['dtlsParameters'];
type ProduceOptions = Parameters<MediasoupWebRtcTransport['produce']>[0];
type ConsumeOptions = Parameters<MediasoupWebRtcTransport['consume']>[0];

export type LiveClassParticipantUser = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
};

export type LiveClassParticipantPresence = {
  id: string;
  participantId: string;
  socketId: string;
  userId: string;
  role: UserRole;
  joinedAt: string;
  user?: LiveClassParticipantUser;
};

type MediaPeer = {
  socketId: string;
  userId: string;
  role: UserRole;
  joinedAt: Date;
  user?: LiveClassParticipantUser;
  transports: Map<string, MediasoupWebRtcTransport>;
  producers: Map<string, MediasoupProducer>;
  consumers: Map<string, MediasoupConsumer>;
  consumerMids: Set<string>;
  nextConsumerMid: number;
};

type MediaRoom = {
  classSessionId: string;
  router: MediasoupRouter;
  peers: Map<string, MediaPeer>;
};

@Injectable()
export class MediaRoomManagerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaRoomManagerService.name);
  private readonly rooms = new Map<string, MediaRoom>();
  private worker: MediasoupWorker | null = null;
  private readonly mediaCodecs: RouterMediaCodec[] = [
    {
      kind: 'audio',
      mimeType: 'audio/opus',
      clockRate: 48000,
      channels: 2,
    },
    {
      kind: 'video',
      mimeType: 'video/VP8',
      clockRate: 90000,
      parameters: {
        'x-google-start-bitrate': 1000,
      },
    },
  ];

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    this.worker = await mediasoup.createWorker({
      rtcMinPort: 40000,
      rtcMaxPort: 49999,
      logLevel: 'warn',
    });

    this.worker.on('died', () => {
      this.logger.error('Mediasoup worker died unexpectedly');
      this.worker = null;
    });
  }

  onModuleDestroy() {
    for (const classSessionId of this.rooms.keys()) {
      this.closeRoom(classSessionId);
    }

    if (this.worker) {
      this.worker.close();
      this.worker = null;
    }
  }

  private getWorkerOrThrow() {
    if (!this.worker) {
      throw new Error('Mediasoup worker is not ready');
    }

    return this.worker;
  }

  private getPeerOrThrow(classSessionId: string, socketId: string) {
    const room = this.rooms.get(classSessionId);
    const peer = room?.peers.get(socketId);

    if (!room || !peer) {
      throw new Error('Media peer is not registered for this class');
    }

    return { room, peer };
  }

  private async findParticipantUser(userId: string) {
    return this.prisma.client.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
      },
    });
  }

  private toParticipant(peer: MediaPeer): LiveClassParticipantPresence {
    return {
      id: peer.socketId,
      participantId: peer.socketId,
      socketId: peer.socketId,
      userId: peer.userId,
      role: peer.role,
      joinedAt: peer.joinedAt.toISOString(),
      ...(peer.user ? { user: peer.user } : {}),
    };
  }

  private reserveConsumerMid(peer: MediaPeer) {
    let mid: string;

    do {
      mid = String(peer.nextConsumerMid);
      peer.nextConsumerMid += 1;
    } while (peer.consumerMids.has(mid));

    peer.consumerMids.add(mid);
    return mid;
  }

  private releaseConsumerMid(peer: MediaPeer, mid?: string) {
    if (mid) {
      peer.consumerMids.delete(mid);
    }
  }

  async getOrCreateRoom(classSessionId: string) {
    const existingRoom = this.rooms.get(classSessionId);
    if (existingRoom) {
      return existingRoom;
    }

    const router = await this.getWorkerOrThrow().createRouter({
      mediaCodecs: this.mediaCodecs,
    });

    const room: MediaRoom = {
      classSessionId,
      router,
      peers: new Map<string, MediaPeer>(),
    };

    this.rooms.set(classSessionId, room);
    return room;
  }

  async registerPeer(
    classSessionId: string,
    socketId: string,
    userId: string,
    role: UserRole,
    user?: LiveClassParticipantUser,
  ) {
    const room = await this.getOrCreateRoom(classSessionId);
    const existingPeer = room.peers.get(socketId);
    const participantUser = (await this.findParticipantUser(userId)) ?? user;

    if (existingPeer) {
      existingPeer.user = participantUser ?? existingPeer.user;
      return this.toParticipant(existingPeer);
    }

    const peer: MediaPeer = {
      socketId,
      userId,
      role,
      joinedAt: new Date(),
      user: participantUser,
      transports: new Map<string, MediasoupWebRtcTransport>(),
      producers: new Map<string, MediasoupProducer>(),
      consumers: new Map<string, MediasoupConsumer>(),
      consumerMids: new Set<string>(),
      nextConsumerMid: 0,
    };

    room.peers.set(socketId, peer);
    return this.toParticipant(peer);
  }

  async createWebRtcTransport(classSessionId: string, socketId: string) {
    const { router, peers } = await this.getOrCreateRoom(classSessionId);
    const peer = peers.get(socketId);

    if (!peer) {
      throw new Error('Media peer is not registered for this class');
    }

    const transport = await router.createWebRtcTransport({
      listenInfos: [
        { protocol: 'udp', ip: '0.0.0.0' },
        { protocol: 'tcp', ip: '0.0.0.0' },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      appData: {
        socketId,
        classSessionId,
      },
    });

    transport.on('dtlsstatechange', (state: string) => {
      if (state === 'closed') {
        transport.close();
      }
    });

    peer.transports.set(transport.id, transport);

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async connectTransport(
    classSessionId: string,
    socketId: string,
    transportId: string,
    dtlsParameters: DtlsParameters,
  ) {
    const { peer } = this.getPeerOrThrow(classSessionId, socketId);
    const transport = peer.transports.get(transportId);

    if (!transport) {
      throw new Error('Transport not found');
    }

    await transport.connect({ dtlsParameters });
  }

  async produce(
    classSessionId: string,
    socketId: string,
    transportId: string,
    produceOptions: ProduceOptions,
  ) {
    const { peer } = this.getPeerOrThrow(classSessionId, socketId);
    const transport = peer.transports.get(transportId);

    if (!transport) {
      throw new Error('Transport not found');
    }

    const producer = await transport.produce(produceOptions);
    peer.producers.set(producer.id, producer);

    producer.on('transportclose', () => {
      peer.producers.delete(producer.id);
    });

    return producer;
  }

  async consume(
    classSessionId: string,
    socketId: string,
    transportId: string,
    producerId: string,
    rtpCapabilities: RtpCapabilities,
  ) {
    const { room, peer } = this.getPeerOrThrow(classSessionId, socketId);
    const transport = peer.transports.get(transportId);

    if (!transport) {
      throw new Error('Transport not found');
    }

    const existingConsumer = Array.from(peer.consumers.values()).find(
      (consumer) => consumer.producerId === producerId && !consumer.closed,
    );

    if (existingConsumer) {
      return existingConsumer;
    }

    if (!room.router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error('The requested producer cannot be consumed');
    }

    const mid = this.reserveConsumerMid(peer);
    let consumer: MediasoupConsumer;

    try {
      consumer = await transport.consume({
        producerId,
        rtpCapabilities,
        paused: false,
        mid,
      } as ConsumeOptions);
    } catch (error) {
      this.releaseConsumerMid(peer, mid);
      throw error;
    }

    peer.consumers.set(consumer.id, consumer);

    consumer.on('transportclose', () => {
      peer.consumers.delete(consumer.id);
      this.releaseConsumerMid(peer, consumer.rtpParameters.mid);
    });

    consumer.on('producerclose', () => {
      peer.consumers.delete(consumer.id);
      this.releaseConsumerMid(peer, consumer.rtpParameters.mid);
      consumer.close();
    });

    return consumer;
  }

  closePeer(classSessionId: string, socketId: string) {
    const room = this.rooms.get(classSessionId);
    const peer = room?.peers.get(socketId);

    if (!room || !peer) {
      return null;
    }

    const participant = this.toParticipant(peer);

    for (const consumer of peer.consumers.values()) {
      consumer.close();
    }

    for (const producer of peer.producers.values()) {
      producer.close();
    }

    for (const transport of peer.transports.values()) {
      transport.close();
    }

    room.peers.delete(socketId);
    return participant;
  }

  closeRoom(classSessionId: string) {
    const room = this.rooms.get(classSessionId);

    if (!room) {
      return [];
    }

    const participants = this.getParticipants(classSessionId);

    for (const socketId of Array.from(room.peers.keys())) {
      this.closePeer(classSessionId, socketId);
    }

    room.router.close();
    this.rooms.delete(classSessionId);
    return participants;
  }

  async getRouterRtpCapabilities(classSessionId: string) {
    const room = await this.getOrCreateRoom(classSessionId);
    return room.router.rtpCapabilities;
  }

  getProducerIds(classSessionId: string, socketId?: string) {
    const room = this.rooms.get(classSessionId);

    if (!room) {
      return [];
    }

    const producerIds = new Set<string>();

    for (const [peerSocketId, peer] of room.peers.entries()) {
      if (socketId && peerSocketId === socketId) {
        continue;
      }

      for (const producer of peer.producers.values()) {
        producerIds.add(producer.id);
      }
    }

    return Array.from(producerIds);
  }

  getParticipant(classSessionId: string, socketId: string) {
    const room = this.rooms.get(classSessionId);
    const peer = room?.peers.get(socketId);

    return peer ? this.toParticipant(peer) : null;
  }

  getParticipants(classSessionId: string) {
    const room = this.rooms.get(classSessionId);

    if (!room) {
      return [];
    }

    return Array.from(room.peers.values()).map((peer) =>
      this.toParticipant(peer),
    );
  }
}
