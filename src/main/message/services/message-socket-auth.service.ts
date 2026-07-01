import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { Socket } from 'socket.io';
import { ENVEnum } from '@/common/enum/env.enum';
import { JWTPayload } from '@/core/jwt/jwt.interface';
import { PrismaService } from '@/lib/prisma/prisma.service';
import { MessageSocketUser } from '../interfaces/message-socket.interface';

type SocketHandshakeAuth = {
  token?: string;
};

@Injectable()
export class MessageSocketAuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async authenticate(client: Socket): Promise<MessageSocketUser> {
    const rawToken = this.getToken(client);

    if (!rawToken) {
      throw new UnauthorizedException('Socket token is required');
    }

    const accessSecret = this.configService.getOrThrow<string>(
      ENVEnum.JWT_ACCESS_SECRET,
    );

    const payload = await this.jwtService.verifyAsync<JWTPayload>(rawToken, {
      secret: accessSecret,
    });

    const user = await this.prisma.client.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.status === UserStatus.INACTIVE) {
      throw new ForbiddenException('Your account is inactive');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException('Your account is suspended');
    }

    return {
      sub: user.id,
      userId: user.id,
      email: user.email,
      role: user.role,
    };
  }

  private getToken(client: Socket) {
    const handshakeAuth = client.handshake.auth as SocketHandshakeAuth;
    const authHeader = client.handshake.headers.authorization;

    return (
      handshakeAuth?.token ??
      (typeof authHeader === 'string'
        ? authHeader.replace(/^Bearer\s+/i, '')
        : undefined) ??
      this.getCookieToken(client.handshake.headers.cookie)
    );
  }

  private getCookieToken(cookieHeader?: string) {
    if (!cookieHeader) {
      return undefined;
    }

    const cookies = cookieHeader.split(';').map((cookie) => cookie.trim());
    const accessTokenCookie = cookies.find((cookie) =>
      cookie.startsWith('accessToken='),
    );

    return accessTokenCookie
      ? decodeURIComponent(accessTokenCookie.split('=').slice(1).join('='))
      : undefined;
  }
}
