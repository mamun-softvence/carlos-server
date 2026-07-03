import axios from 'axios';
import { ENVEnum } from '@/common/enum/env.enum';
import { PrismaService } from '@/lib/prisma/prisma.service';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BookingStatus, Prisma } from '@prisma/client';

type CalendarUser = {
  id: string;
  email: string;
  name: string | null;
  timeZone: string | null;
  googleCalendarEnabled: boolean;
  googleCalendarEmail: string | null;
  googleCalendarAccessToken: string | null;
  googleCalendarRefreshToken: string | null;
  googleCalendarTokenExpiry: Date | null;
};

type GoogleCalendarState = {
  sub: string;
  type: 'google-calendar-connect';
};

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
};

type SyncBooking = Prisma.BookingGetPayload<{
  include: {
    student: {
      select: {
        id: true;
        email: true;
        name: true;
        timeZone: true;
        googleCalendarEnabled: true;
        googleCalendarEmail: true;
        googleCalendarAccessToken: true;
        googleCalendarRefreshToken: true;
        googleCalendarTokenExpiry: true;
      };
    };
    tutor: {
      select: {
        id: true;
        email: true;
        name: true;
        timeZone: true;
        googleCalendarEnabled: true;
        googleCalendarEmail: true;
        googleCalendarAccessToken: true;
        googleCalendarRefreshToken: true;
        googleCalendarTokenExpiry: true;
      };
    };
    participants: {
      select: {
        student: {
          select: {
            id: true;
            email: true;
            name: true;
            timeZone: true;
            googleCalendarEnabled: true;
            googleCalendarEmail: true;
            googleCalendarAccessToken: true;
            googleCalendarRefreshToken: true;
            googleCalendarTokenExpiry: true;
          };
        };
      };
    };
    googleCalendarBookingEvents: true;
  };
}>;

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private readonly calendarScope =
    'https://www.googleapis.com/auth/calendar.events';
  private readonly userSelect = {
    id: true,
    email: true,
    name: true,
    timeZone: true,
    googleCalendarEnabled: true,
    googleCalendarEmail: true,
    googleCalendarAccessToken: true,
    googleCalendarRefreshToken: true,
    googleCalendarTokenExpiry: true,
  } as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async getStatus(userId: string) {
    const user = await this.getCalendarUserOrThrow(userId);

    return {
      message: 'Google Calendar status fetched successfully',
      data: {
        connected: this.hasGoogleCalendarConnection(user),
        enabled: user.googleCalendarEnabled,
        googleEmail: user.googleCalendarEmail,
      },
    };
  }

  async getConnectUrl(userId: string) {
    await this.ensureUserExists(userId);

    const state = await this.jwtService.signAsync<GoogleCalendarState>(
      {
        sub: userId,
        type: 'google-calendar-connect',
      },
      {
        secret: this.configService.getOrThrow<string>(
          ENVEnum.JWT_ACCESS_SECRET,
        ),
        expiresIn: '15m',
      },
    );

    const params = new URLSearchParams({
      client_id: this.configService.getOrThrow<string>(
        ENVEnum.GOOGLE_CLIENT_ID,
      ),
      redirect_uri: this.getCallbackUrl(),
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      scope: ['openid', 'email', 'profile', this.calendarScope].join(' '),
      state,
    });

    return {
      message: 'Google Calendar connect URL generated successfully',
      data: {
        url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      },
    };
  }

  async handleCallback(code?: string, state?: string) {
    const failureRedirect = this.buildFrontendRedirect('error');

    if (!code || !state) {
      return failureRedirect;
    }

    try {
      const payload = await this.jwtService.verifyAsync<GoogleCalendarState>(
        state,
        {
          secret: this.configService.getOrThrow<string>(
            ENVEnum.JWT_ACCESS_SECRET,
          ),
        },
      );

      if (payload.type !== 'google-calendar-connect') {
        return failureRedirect;
      }

      const user = await this.getCalendarUserOrThrow(payload.sub);
      const tokens = await this.exchangeCodeForTokens(code);
      const googleEmail = await this.fetchGoogleEmail(tokens.access_token);

      await this.prisma.client.user.update({
        where: { id: user.id },
        data: {
          googleCalendarAccessToken: tokens.access_token,
          googleCalendarRefreshToken:
            tokens.refresh_token ?? user.googleCalendarRefreshToken,
          googleCalendarTokenExpiry: this.getAccessTokenExpiry(
            tokens.expires_in,
          ),
          googleCalendarEnabled: true,
          googleCalendarEmail: googleEmail,
        },
      });

      await this.syncUserScheduledBookings(user.id);

      return this.buildFrontendRedirect('connected');
    } catch (error) {
      this.logger.error(
        `Google Calendar callback failed: ${this.getErrorMessage(error)}`,
      );
      return failureRedirect;
    }
  }

  async updateSettings(userId: string, enabled: boolean) {
    const user = await this.getCalendarUserOrThrow(userId);

    if (enabled && !this.hasGoogleCalendarConnection(user)) {
      throw new BadRequestException('Connect Google Calendar first');
    }

    await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        googleCalendarEnabled: enabled,
      },
    });

    if (enabled) {
      await this.syncUserScheduledBookings(userId);
    } else {
      await this.removeUserSyncedEvents(userId, user);
    }

    return {
      message: `Google Calendar sync ${enabled ? 'enabled' : 'disabled'} successfully`,
      data: {
        connected: this.hasGoogleCalendarConnection(user),
        enabled,
      },
    };
  }

  async disconnect(userId: string) {
    const user = await this.getCalendarUserOrThrow(userId);

    await this.removeUserSyncedEvents(userId, user);

    const tokenToRevoke =
      user.googleCalendarRefreshToken ?? user.googleCalendarAccessToken;

    if (tokenToRevoke) {
      await this.revokeToken(tokenToRevoke);
    }

    await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        googleCalendarEnabled: false,
        googleCalendarEmail: null,
        googleCalendarAccessToken: null,
        googleCalendarRefreshToken: null,
        googleCalendarTokenExpiry: null,
      },
    });

    return {
      message: 'Google Calendar disconnected successfully',
      data: {
        connected: false,
        enabled: false,
      },
    };
  }

  async syncBooking(bookingId: string) {
    try {
      await this.syncBookingInternal(bookingId);
    } catch (error) {
      this.logger.warn(
        `Google Calendar sync skipped for booking ${bookingId}: ${this.getErrorMessage(error)}`,
      );
    }
  }

  private async syncBookingInternal(bookingId: string) {
    const booking = await this.prisma.client.booking.findUnique({
      where: { id: bookingId },
      include: {
        student: {
          select: this.userSelect,
        },
        tutor: {
          select: this.userSelect,
        },
        participants: {
          select: {
            student: {
              select: this.userSelect,
            },
          },
        },
        googleCalendarBookingEvents: true,
      },
    });

    if (!booking) {
      return;
    }

    const currentUsers = this.collectBookingUsers(booking);
    const existingEventUserIds = booking.googleCalendarBookingEvents.map(
      (event) => event.userId,
    );
    const missingUserIds = existingEventUserIds.filter(
      (userId) => !currentUsers.has(userId),
    );
    const missingUsers = await this.findCalendarUsersByIds(missingUserIds);
    const knownUsers = new Map<string, CalendarUser>([
      ...currentUsers,
      ...missingUsers.map((user) => [user.id, user] as const),
    ]);

    if (
      booking.status === BookingStatus.CANCELLED ||
      !booking.scheduledAt ||
      !booking.durationMinutes
    ) {
      await this.removeBookingEvents(booking, knownUsers);
      return;
    }

    const activeUsers = new Map(
      [...currentUsers.values()]
        .filter(
          (user) =>
            user.googleCalendarEnabled &&
            this.hasGoogleCalendarConnection(user),
        )
        .map((user) => [user.id, user] as const),
    );

    for (const event of booking.googleCalendarBookingEvents) {
      if (activeUsers.has(event.userId)) {
        continue;
      }

      const canDeleteLocal = await this.deleteRemoteEventForUser(
        knownUsers.get(event.userId),
        event.externalEventId,
      );

      if (canDeleteLocal) {
        await this.prisma.client.googleCalendarBookingEvent.delete({
          where: {
            bookingId_userId: {
              bookingId: booking.id,
              userId: event.userId,
            },
          },
        });
      }
    }

    const existingEventsByUserId = new Map(
      booking.googleCalendarBookingEvents.map((event) => [event.userId, event]),
    );

    for (const user of activeUsers.values()) {
      const externalEventId = await this.upsertRemoteEvent(
        user,
        booking,
        existingEventsByUserId.get(user.id)?.externalEventId,
      );

      await this.prisma.client.googleCalendarBookingEvent.upsert({
        where: {
          bookingId_userId: {
            bookingId: booking.id,
            userId: user.id,
          },
        },
        create: {
          bookingId: booking.id,
          userId: user.id,
          externalEventId,
        },
        update: {
          externalEventId,
        },
      });
    }
  }

  private async syncUserScheduledBookings(userId: string) {
    const bookings = await this.prisma.client.booking.findMany({
      where: {
        status: BookingStatus.SCHEDULED,
        scheduledAt: {
          gte: new Date(),
        },
        OR: [
          { studentId: userId },
          { tutorId: userId },
          {
            participants: {
              some: {
                studentId: userId,
              },
            },
          },
        ],
      },
      select: {
        id: true,
      },
    });

    for (const booking of bookings) {
      await this.syncBooking(booking.id);
    }
  }

  private async removeUserSyncedEvents(userId: string, user: CalendarUser) {
    const events = await this.prisma.client.googleCalendarBookingEvent.findMany(
      {
        where: { userId },
      },
    );

    for (const event of events) {
      await this.deleteRemoteEventForUser(user, event.externalEventId);
    }

    await this.prisma.client.googleCalendarBookingEvent.deleteMany({
      where: { userId },
    });
  }

  private async removeBookingEvents(
    booking: SyncBooking,
    knownUsers: Map<string, CalendarUser>,
  ) {
    for (const event of booking.googleCalendarBookingEvents) {
      const canDeleteLocal = await this.deleteRemoteEventForUser(
        knownUsers.get(event.userId),
        event.externalEventId,
      );

      if (canDeleteLocal) {
        await this.prisma.client.googleCalendarBookingEvent.delete({
          where: {
            bookingId_userId: {
              bookingId: booking.id,
              userId: event.userId,
            },
          },
        });
      }
    }
  }

  private collectBookingUsers(booking: SyncBooking) {
    const users = new Map<string, CalendarUser>();

    users.set(booking.student.id, booking.student);

    if (booking.tutor) {
      users.set(booking.tutor.id, booking.tutor);
    }

    for (const participant of booking.participants) {
      users.set(participant.student.id, participant.student);
    }

    return users;
  }

  private async findCalendarUsersByIds(userIds: string[]) {
    if (userIds.length === 0) {
      return [];
    }

    return this.prisma.client.user.findMany({
      where: {
        id: {
          in: [...new Set(userIds)],
        },
      },
      select: this.userSelect,
    });
  }

  private async upsertRemoteEvent(
    user: CalendarUser,
    booking: SyncBooking,
    externalEventId?: string,
  ) {
    const accessToken = await this.getValidAccessToken(user);
    const payload = this.buildGoogleEventPayload(booking, user);

    if (externalEventId) {
      try {
        await axios.put(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(
            externalEventId,
          )}`,
          payload,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );

        return externalEventId;
      } catch (error) {
        if (!this.isGoogleNotFound(error)) {
          throw error;
        }
      }
    }

    const response = await axios.post(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    return response.data.id as string;
  }

  private async deleteRemoteEventForUser(
    user: CalendarUser | undefined,
    externalEventId: string,
  ) {
    if (!user || !this.hasGoogleCalendarConnection(user)) {
      return true;
    }

    try {
      const accessToken = await this.getValidAccessToken(user);

      await axios.delete(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(
          externalEventId,
        )}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      return true;
    } catch (error) {
      if (this.isGoogleNotFound(error)) {
        return true;
      }

      this.logger.warn(
        `Failed to delete Google Calendar event ${externalEventId}: ${this.getErrorMessage(error)}`,
      );
      return false;
    }
  }

  private async getValidAccessToken(user: CalendarUser) {
    const now = Date.now();
    const expiry = user.googleCalendarTokenExpiry?.getTime() ?? 0;

    if (user.googleCalendarAccessToken && expiry > now + 60_000) {
      return user.googleCalendarAccessToken;
    }

    if (!user.googleCalendarRefreshToken) {
      throw new BadRequestException(
        `Google Calendar is not connected for ${user.email}`,
      );
    }

    const params = new URLSearchParams({
      client_id: this.configService.getOrThrow<string>(
        ENVEnum.GOOGLE_CLIENT_ID,
      ),
      client_secret: this.configService.getOrThrow<string>(
        ENVEnum.GOOGLE_CLIENT_SECRET,
      ),
      refresh_token: user.googleCalendarRefreshToken,
      grant_type: 'refresh_token',
    });

    const response = await axios.post<GoogleTokenResponse>(
      'https://oauth2.googleapis.com/token',
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    const accessToken = response.data.access_token;
    const tokenExpiry = this.getAccessTokenExpiry(response.data.expires_in);

    await this.prisma.client.user.update({
      where: { id: user.id },
      data: {
        googleCalendarAccessToken: accessToken,
        googleCalendarTokenExpiry: tokenExpiry,
      },
    });

    user.googleCalendarAccessToken = accessToken;
    user.googleCalendarTokenExpiry = tokenExpiry;

    return accessToken;
  }

  private buildGoogleEventPayload(booking: SyncBooking, user: CalendarUser) {
    const startDate = booking.scheduledAt ?? new Date();
    const endDate = new Date(
      startDate.getTime() + (booking.durationMinutes ?? 50) * 60_000,
    );
    const studentNames = [
      booking.student.name ?? booking.student.email,
      ...booking.participants
        .map((participant) => participant.student)
        .filter((student) => student.id !== booking.student.id)
        .map((student) => student.name ?? student.email),
    ];

    return {
      summary: booking.topic ?? 'Class Session',
      description: [
        booking.note ? `Note: ${booking.note}` : null,
        booking.courseReference ? `Course: ${booking.courseReference}` : null,
        booking.moduleReference ? `Module: ${booking.moduleReference}` : null,
        booking.tutor
          ? `Tutor: ${booking.tutor.name ?? booking.tutor.email}`
          : null,
        `Students: ${studentNames.join(', ')}`,
      ]
        .filter(Boolean)
        .join('\n'),
      start: {
        dateTime: startDate.toISOString(),
        timeZone: user.timeZone ?? 'UTC',
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: user.timeZone ?? 'UTC',
      },
    };
  }

  private async exchangeCodeForTokens(code: string) {
    const params = new URLSearchParams({
      code,
      client_id: this.configService.getOrThrow<string>(
        ENVEnum.GOOGLE_CLIENT_ID,
      ),
      client_secret: this.configService.getOrThrow<string>(
        ENVEnum.GOOGLE_CLIENT_SECRET,
      ),
      redirect_uri: this.getCallbackUrl(),
      grant_type: 'authorization_code',
    });

    const response = await axios.post<GoogleTokenResponse>(
      'https://oauth2.googleapis.com/token',
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    return response.data;
  }

  private async fetchGoogleEmail(accessToken: string) {
    const response = await axios.get<{ email?: string }>(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    return response.data.email ?? null;
  }

  private async revokeToken(accessToken: string) {
    try {
      const params = new URLSearchParams({
        token: accessToken,
      });

      await axios.post(
        'https://oauth2.googleapis.com/revoke',
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );
    } catch (error) {
      this.logger.warn(
        `Failed to revoke Google Calendar token: ${this.getErrorMessage(error)}`,
      );
    }
  }

  private async getCalendarUserOrThrow(userId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: this.userSelect,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private async ensureUserExists(userId: string) {
    await this.getCalendarUserOrThrow(userId);
  }

  private hasGoogleCalendarConnection(user: CalendarUser) {
    return Boolean(
      user.googleCalendarRefreshToken || user.googleCalendarAccessToken,
    );
  }

  private getCallbackUrl() {
    const configuredBaseUrl = this.configService.get<string>(ENVEnum.BASE_URL);

    if (configuredBaseUrl) {
      return `${configuredBaseUrl.replace(/\/$/, '')}/api/v1/google-calendar/callback`;
    }

    const port = this.configService.get<string>(ENVEnum.PORT) ?? '3000';
    return `http://localhost:${port}/api/v1/google-calendar/callback`;
  }

  private buildFrontendRedirect(status: 'connected' | 'error') {
    const frontendUrl =
      this.configService.get<string>(ENVEnum.FRONTEND_URL) ??
      'http://localhost:5173';
    const redirectUrl = new URL(frontendUrl);

    redirectUrl.searchParams.set('googleCalendar', status);

    return redirectUrl.toString();
  }

  private getAccessTokenExpiry(expiresInSeconds: number) {
    return new Date(Date.now() + expiresInSeconds * 1000);
  }

  private isGoogleNotFound(error: unknown) {
    return (
      axios.isAxiosError(error) &&
      (error.response?.status === 404 || error.response?.status === 410)
    );
  }

  private getErrorMessage(error: unknown) {
    if (axios.isAxiosError(error)) {
      const message =
        (error.response?.data as { error_description?: string } | undefined)
          ?.error_description ??
        (error.response?.data as { error?: { message?: string } } | undefined)
          ?.error?.message ??
        error.message;

      return message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'Unknown error';
  }
}
