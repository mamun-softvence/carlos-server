import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { ENVEnum } from '@/common/enum/env.enum';
import { LiveClassSocketUser } from '../interfaces/live-class.interface';

type SocketHandshakeAuth = {
  token?: string;
};

@Injectable()
export class LiveClassSocketAuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async authenticate(client: Socket) {
    const handshakeAuth = client.handshake.auth as SocketHandshakeAuth;
    const authHeader = client.handshake.headers.authorization;
    const rawToken =
      handshakeAuth?.token ??
      (typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '') : undefined);

    if (!rawToken) {
      throw new UnauthorizedException('Socket token is required');
    }

    const accessSecret = this.configService.getOrThrow<string>(
      ENVEnum.JWT_ACCESS_SECRET,
    );

    const payload = await this.jwtService.verifyAsync<LiveClassSocketUser>(
      rawToken,
      {
        secret: accessSecret,
      },
    );

    return {
      ...payload,
      userId: payload.sub,
    };
  }
}
