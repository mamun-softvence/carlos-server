import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BookingStatus,
  LiveClassStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { RtcRole, RtcTokenBuilder } from 'agora-token';
import { ENVEnum } from '@/common/enum/env.enum';
import { PrismaService } from '@/lib/prisma/prisma.service';

type SessionBooking = Prisma.BookingGetPayload<{
  include: {
    student: {
      select: { id: true; name: true; email: true; avatarUrl: true };
    };
    tutor: {
      select: { id: true; name: true; email: true; avatarUrl: true };
    };
    assignedByAdmin: {
      select: { id: true; name: true; email: true };
    };
  };
}>;

type SessionParticipantUser = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
};

type BookingParticipantRow = {
  studentId: string;
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
};

type AuthorizedSession = {
  booking: SessionBooking;
  participantStudents: SessionParticipantUser[];
  participantRole: 'tutor' | 'student' | 'admin';
};

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private readonly bookingInclude = {
    student: {
      select: { id: true, name: true, email: true, avatarUrl: true },
    },
    tutor: {
      select: { id: true, name: true, email: true, avatarUrl: true },
    },
    assignedByAdmin: {
      select: { id: true, name: true, email: true },
    },
  } as const;

  async getSessionDetails(
    userId: string,
    userRole: UserRole,
    sessionId: string,
  ) {
    const authorized = await this.authorizeSessionAccess(
      userId,
      userRole,
      sessionId,
    );

    return {
      message: 'Session fetched successfully',
      data: this.toSessionResponse(authorized),
    };
  }

  async createAgoraToken(
    userId: string,
    userRole: UserRole,
    sessionId: string,
  ) {
    const authorized = await this.authorizeSessionAccess(
      userId,
      userRole,
      sessionId,
      { requireLive: true },
    );

    const appId = this.configService.getOrThrow<string>(ENVEnum.AGORA_APP_ID);
    const appCertificate = this.configService.getOrThrow<string>(
      ENVEnum.AGORA_APP_CERTIFICATE,
    );
    const expiresIn = this.getTokenExpirySeconds();
    const channelName = this.getChannelName(authorized.booking.id);
    const tokenRole = this.getAgoraTokenRole(authorized.participantRole);
    const token = RtcTokenBuilder.buildTokenWithUserAccount(
      appId,
      appCertificate,
      channelName,
      userId,
      tokenRole,
      expiresIn,
      expiresIn,
    );

    return {
      message: 'Agora token generated successfully',
      data: {
        appId,
        token,
        channelName,
        uid: userId,
        expiresIn,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
        rtcRole: tokenRole === RtcRole.PUBLISHER ? 'publisher' : 'subscriber',
        clientRole:
          authorized.participantRole === 'tutor' ? 'host' : 'audience',
        participantRole: authorized.participantRole,
        session: this.toSessionResponse(authorized),
      },
    };
  }

  async getSessionMessages(
    userId: string,
    userRole: UserRole,
    sessionId: string,
  ) {
    await this.authorizeSessionAccess(userId, userRole, sessionId);

    const messages = await this.prisma.client.liveClassMessage.findMany({
      where: {
        bookingId: sessionId,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return {
      message: 'Session messages fetched successfully',
      data: messages.map((message) => this.toMessageResponse(message)),
    };
  }

  async startSession(tutorId: string, sessionId: string) {
    const booking = await this.ensureTutorCanManageSession(tutorId, sessionId);

    if (booking.liveClassStatus === LiveClassStatus.ENDED) {
      throw new BadRequestException('This session has already ended');
    }

    if (booking.liveClassStatus === LiveClassStatus.LIVE) {
      return {
        message: 'Session is already active',
        data: this.toSessionResponse({
          booking,
          participantStudents: await this.getParticipantStudents(booking),
          participantRole: 'tutor',
        }),
      };
    }

    const updated = await this.prisma.client.booking.update({
      where: { id: sessionId },
      data: {
        liveClassStatus: LiveClassStatus.LIVE,
        startedAt: booking.startedAt ?? new Date(),
      },
      include: this.bookingInclude,
    });

    return {
      message: 'Session started successfully',
      data: this.toSessionResponse({
        booking: updated,
        participantStudents: await this.getParticipantStudents(updated),
        participantRole: 'tutor',
      }),
    };
  }

  async endSession(tutorId: string, sessionId: string) {
    const booking = await this.ensureTutorCanManageSession(tutorId, sessionId);

    if (booking.liveClassStatus === LiveClassStatus.ENDED) {
      return {
        message: 'Session already ended',
        data: this.toSessionResponse({
          booking,
          participantStudents: await this.getParticipantStudents(booking),
          participantRole: 'tutor',
        }),
      };
    }

    const endedAt = new Date();
    const updated = await this.prisma.client.booking.update({
      where: { id: sessionId },
      data: {
        liveClassStatus: LiveClassStatus.ENDED,
        endedAt,
        completedAt: booking.completedAt ?? endedAt,
        status:
          booking.status === BookingStatus.CANCELLED
            ? BookingStatus.CANCELLED
            : BookingStatus.COMPLETED,
      },
      include: this.bookingInclude,
    });

    return {
      message: 'Session ended successfully',
      data: this.toSessionResponse({
        booking: updated,
        participantStudents: await this.getParticipantStudents(updated),
        participantRole: 'tutor',
      }),
    };
  }

  async createSessionMessage(
    userId: string,
    userRole: UserRole,
    sessionId: string,
    content: string,
  ) {
    await this.authorizeSessionAccess(userId, userRole, sessionId, {
      requireLive: true,
    });

    const trimmedContent = content.trim();

    if (!trimmedContent) {
      throw new BadRequestException('Message cannot be empty');
    }

    const message = await this.prisma.client.liveClassMessage.create({
      data: {
        bookingId: sessionId,
        senderId: userId,
        message: trimmedContent,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            role: true,
          },
        },
      },
    });

    return this.toMessageResponse(message);
  }

  async authorizeSessionAccess(
    userId: string,
    userRole: UserRole,
    sessionId: string,
    options: { requireLive?: boolean } = {},
  ): Promise<AuthorizedSession> {
    const booking = await this.syncLiveSessionState(sessionId);

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException(
        'Cancelled bookings cannot be used as live sessions',
      );
    }

    if (booking.status === BookingStatus.PENDING) {
      throw new ForbiddenException('This session is not scheduled yet');
    }

    if (!booking.tutorId) {
      throw new ForbiddenException('This session does not have a tutor yet');
    }

    if (options.requireLive && booking.status !== BookingStatus.SCHEDULED) {
      throw new ForbiddenException('This session is not available to join');
    }

    if (
      options.requireLive &&
      booking.liveClassStatus !== LiveClassStatus.LIVE
    ) {
      throw new ForbiddenException('This session is not live yet');
    }

    const participantStudents = await this.getParticipantStudents(booking);
    const participantStudentIds = new Set(
      participantStudents.map((student) => student.id),
    );

    const isTutor = userRole === UserRole.TUTOR && booking.tutorId === userId;
    const isStudent =
      userRole === UserRole.STUDENT && participantStudentIds.has(userId);
    const isAdmin = userRole === UserRole.ADMIN;

    if (!isTutor && !isStudent && !isAdmin) {
      throw new ForbiddenException('You do not have access to this session');
    }

    return {
      booking,
      participantStudents,
      participantRole: isTutor ? 'tutor' : isAdmin ? 'admin' : 'student',
    };
  }

  private async getBookingOrThrow(bookingId: string) {
    const booking = await this.prisma.client.booking.findUnique({
      where: { id: bookingId },
      include: this.bookingInclude,
    });

    if (!booking) {
      throw new NotFoundException('Session not found');
    }

    return booking;
  }

  private async ensureTutorCanManageSession(
    tutorId: string,
    sessionId: string,
  ) {
    const booking = await this.getBookingOrThrow(sessionId);

    if (booking.tutorId !== tutorId) {
      throw new ForbiddenException(
        'Only the assigned teacher can manage this session',
      );
    }

    if (!booking.scheduledAt) {
      throw new BadRequestException(
        'Session is missing a scheduled start time',
      );
    }

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Cancelled sessions cannot be started');
    }

    return booking;
  }

  private async syncLiveSessionState(bookingId: string) {
    const booking = await this.getBookingOrThrow(bookingId);

    if (booking.status === BookingStatus.CANCELLED) {
      return booking;
    }

    const now = new Date();
    if (
      booking.liveClassStatus === LiveClassStatus.SCHEDULED &&
      booking.status === BookingStatus.SCHEDULED &&
      booking.scheduledAt &&
      booking.scheduledAt <= now
    ) {
      return this.prisma.client.booking.update({
        where: { id: booking.id },
        data: {
          liveClassStatus: LiveClassStatus.LIVE,
          startedAt: booking.startedAt ?? now,
        },
        include: this.bookingInclude,
      });
    }

    return booking;
  }

  private async getParticipantStudents(booking: SessionBooking) {
    const students = new Map<string, SessionParticipantUser>();
    students.set(booking.student.id, booking.student);
    const participantRows = await this.findBookingParticipantRows(booking.id);

    for (const participant of participantRows) {
      students.set(participant.studentId, {
        id: participant.id,
        name: participant.name,
        email: participant.email,
        avatarUrl: participant.avatarUrl,
      });
    }

    return Array.from(students.values());
  }

  private async findBookingParticipantRows(bookingId: string) {
    try {
      return await this.prisma.client.$queryRaw<BookingParticipantRow[]>`
        SELECT
          bp."studentId",
          u."id",
          u."name",
          u."email",
          u."avatarUrl"
        FROM "booking_participants" bp
        INNER JOIN "users" u ON u."id" = bp."studentId"
        WHERE bp."bookingId" = ${bookingId}
        ORDER BY bp."createdAt" ASC
      `;
    } catch (error) {
      if (this.isMissingBookingParticipantsTableError(error)) {
        return [];
      }

      throw error;
    }
  }

  private isMissingBookingParticipantsTableError(error: unknown) {
    const maybeError = error as {
      code?: string;
      meta?: {
        message?: string;
        driverAdapterError?: {
          cause?: {
            originalCode?: string;
            table?: string;
          };
        };
      };
    };

    const cause = maybeError.meta?.driverAdapterError?.cause;

    return (
      maybeError.code === 'P2010' &&
      (cause?.originalCode === '42P01' ||
        cause?.table === 'booking_participants' ||
        maybeError.meta?.message?.includes(
          'relation "booking_participants" does not exist',
        ))
    );
  }

  private getChannelName(bookingId: string) {
    return `booking-${bookingId}`;
  }

  private getTokenExpirySeconds() {
    const configured = this.configService.get<string>(
      ENVEnum.AGORA_TOKEN_EXPIRE_SECONDS,
    );
    const parsed = configured ? Number(configured) : 60 * 60;

    if (!Number.isFinite(parsed) || parsed < 60) {
      return 60 * 60;
    }

    return Math.floor(parsed);
  }

  private getAgoraTokenRole(
    participantRole: AuthorizedSession['participantRole'],
  ) {
    return participantRole === 'tutor' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
  }

  private toSessionResponse(authorized: AuthorizedSession) {
    const { booking, participantStudents, participantRole } = authorized;

    return {
      sessionId: booking.id,
      bookingId: booking.id,
      channelName: this.getChannelName(booking.id),
      title: booking.topic,
      topic: booking.topic,
      note: booking.note,
      courseReference: booking.courseReference,
      moduleReference: booking.moduleReference,
      scheduledAt: booking.scheduledAt,
      durationMinutes: booking.durationMinutes,
      status: booking.liveClassStatus.toLowerCase(),
      lifecycleStatus: booking.liveClassStatus,
      bookingStatus: booking.status,
      startedAt: booking.startedAt,
      endedAt: booking.endedAt,
      tutor: booking.tutor,
      students: participantStudents,
      participantRole,
      allowPublishing: participantRole === 'tutor',
      allowScreenShare: participantRole === 'tutor',
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    };
  }

  private toMessageResponse(
    message: Prisma.LiveClassMessageGetPayload<{
      include: {
        sender: {
          select: {
            id: true;
            name: true;
            email: true;
            avatarUrl: true;
            role: true;
          };
        };
      };
    }>,
  ) {
    return {
      id: message.id,
      sessionId: message.bookingId,
      bookingId: message.bookingId,
      senderId: message.senderId,
      sender: message.sender,
      content: message.message,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    };
  }
}
