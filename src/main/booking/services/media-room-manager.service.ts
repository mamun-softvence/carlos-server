import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as mediasoup from 'mediasoup';
import { UserRole } from '@prisma/client';

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
type RtpCapabilities = Parameters<MediasoupRouter['canConsume']>[0]['rtpCapabilities'];
type DtlsParameters = Parameters<MediasoupWebRtcTransport['connect']>[0]['dtlsParameters'];
type ProduceOptions = Parameters<MediasoupWebRtcTransport['produce']>[0];
type ConsumeOptions = Parameters<MediasoupWebRtcTransport['consume']>[0];

type MediaPeer = {
  socketId: string;
  userId: string;
  role: UserRole;
  transports: Map<string, MediasoupWebRtcTransport>;
  producers: Map<string, MediasoupProducer>;
  consumers: Map<string, MediasoupConsumer>;
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

  async onModuleDestroy() {
    for (const classSessionId of this.rooms.keys()) {
      await this.closeRoom(classSessionId);
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
  ) {
    const room = await this.getOrCreateRoom(classSessionId);
    const existingPeer = room.peers.get(socketId);

    if (existingPeer) {
      return existingPeer;
    }

    const peer: MediaPeer = {
      socketId,
      userId,
      role,
      transports: new Map<string, MediasoupWebRtcTransport>(),
      producers: new Map<string, MediasoupProducer>(),
      consumers: new Map<string, MediasoupConsumer>(),
    };

    room.peers.set(socketId, peer);
    return peer;
  }

  async createWebRtcTransport(classSessionId: string, socketId: string) {
    const { router, peers } = await this.getOrCreateRoom(classSessionId);
    const peer = peers.get(socketId);

    if (!peer) {
      throw new Error('Media peer is not registered for this class');
    }

    const transport = await router.createWebRtcTransport({
      listenInfos: [{ protocol: 'udp', ip: '0.0.0.0' }, { protocol: 'tcp', ip: '0.0.0.0' }],
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

    if (!room.router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error('The requested producer cannot be consumed');
    }

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: false,
    } as ConsumeOptions);

    peer.consumers.set(consumer.id, consumer);

    consumer.on('transportclose', () => {
      peer.consumers.delete(consumer.id);
    });

    consumer.on('producerclose', () => {
      peer.consumers.delete(consumer.id);
      consumer.close();
    });

    return consumer;
  }

  async closePeer(classSessionId: string, socketId: string) {
    const room = this.rooms.get(classSessionId);
    const peer = room?.peers.get(socketId);

    if (!room || !peer) {
      return;
    }

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
  }

  async closeRoom(classSessionId: string) {
    const room = this.rooms.get(classSessionId);

    if (!room) {
      return;
    }

    for (const socketId of room.peers.keys()) {
      await this.closePeer(classSessionId, socketId);
    }

    room.router.close();
    this.rooms.delete(classSessionId);
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

    const producerIds: string[] = [];

    for (const [peerSocketId, peer] of room.peers.entries()) {
      if (socketId && peerSocketId === socketId) {
        continue;
      }

      for (const producer of peer.producers.values()) {
        producerIds.push(producer.id);
      }
    }

    return producerIds;
  }
}
