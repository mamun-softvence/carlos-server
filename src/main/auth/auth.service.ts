import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import { PrismaService } from 'src/lib/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { ENVEnum } from '@/common/enum/env.enum';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { MailService } from '@/common/mail/mail.service';
import { AuthProvider } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly userProfileSelect = {
    id: true,
    name: true,
    email: true,
    role: true,
    avatarUrl: true,
    provider: true,
    isEmailVerified: true,
    acceptedTerms: true,
    status: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  async register(payload: RegisterDto) {
    const { email, password, confirmPassword, acceptedTerms } = payload;

    if (password !== confirmPassword) {
      throw new BadRequestException(
        'Password and confirm password do not match',
      );
    }

    if (!acceptedTerms) {
      throw new BadRequestException('You must accept Terms and Conditions');
    }

    const existingUser = await this.prisma.client.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('User already exists with this email');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.prisma.client.user.create({
      data: {
        email,
        password: hashedPassword,
        acceptedTerms,
      },
      select: this.userProfileSelect,
    });

    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const hashedRefreshToken = await bcrypt.hash(tokens.refreshToken, 10);

    await this.prisma.client.user.update({
      where: { id: user.id },
      data: {
        refreshToken: hashedRefreshToken,
      },
    });

    return {
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async login(payload: LoginDto) {
    const { email, password } = payload;

    const user = await this.prisma.client.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.provider !== 'EMAIL') {
      throw new BadRequestException(
        `This account uses ${user.provider} login. Please continue with ${user.provider}.`,
      );
    }

    if (!user.password) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status === 'INACTIVE') {
      throw new ForbiddenException('Your account is inactive');
    }

    if (user.status === 'SUSPENDED') {
      throw new ForbiddenException('Your account is suspended');
    }

    const isPasswordMatched = await bcrypt.compare(password, user.password);

    if (!isPasswordMatched) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const safeUser = await this.prisma.client.user.findUnique({
      where: { id: user.id },
      select: this.userProfileSelect,
    });

    if (!safeUser) {
      throw new UnauthorizedException('User not found');
    }

    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const hashedRefreshToken = await bcrypt.hash(tokens.refreshToken, 10);

    await this.prisma.client.user.update({
      where: { id: user.id },
      data: {
        refreshToken: hashedRefreshToken,
      },
    });

    return {
      user: safeUser,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: this.userProfileSelect,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async logout(userId: string) {
    await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        refreshToken: null,
      },
    });
  }

  private async generateTokens(payload: JwtPayload) {
    const accessSecret = this.configService.getOrThrow<string>(
      ENVEnum.JWT_ACCESS_SECRET,
    );
    const refreshSecret = this.configService.getOrThrow<string>(
      ENVEnum.JWT_REFRESH_SECRET,
    );

    const accessExpiresIn =
      this.configService.get<string>(ENVEnum.JWT_ACCESS_EXPIRES_IN) ?? '1d';

    const refreshExpiresIn =
      this.configService.get<string>(ENVEnum.JWT_REFRESH_EXPIRES_IN) ?? '7d';

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload as any, {
        secret: accessSecret,
        expiresIn: accessExpiresIn as any,
      }),
      this.jwtService.signAsync(payload as any, {
        secret: refreshSecret,
        expiresIn: refreshExpiresIn as any,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  async refreshToken(oldRefreshToken: string) {
    if (!oldRefreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    const refreshSecret = this.configService.getOrThrow<string>(
      ENVEnum.JWT_REFRESH_SECRET,
    );

    let payload: any;

    try {
      payload = await this.jwtService.verifyAsync(oldRefreshToken, {
        secret: refreshSecret,
      });
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.client.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Access denied');
    }

    const isTokenValid = await bcrypt.compare(
      oldRefreshToken,
      user.refreshToken,
    );

    if (!isTokenValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const hashedRefreshToken = await bcrypt.hash(tokens.refreshToken, 10);

    await this.prisma.client.user.update({
      where: { id: user.id },
      data: {
        refreshToken: hashedRefreshToken,
      },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async googleLogin(profile: {
    email: string;
    name: string;
    providerId: string;
  }) {
    let user = await this.prisma.client.user.findUnique({
      where: { email: profile.email },
    });

    if (!user) {
      user = await this.prisma.client.user.create({
        data: {
          email: profile.email,
          name: profile.name,
          provider: AuthProvider.GOOGLE,
          providerId: profile.providerId,
          isEmailVerified: true,
          acceptedTerms: true,
        },
      });
    }

    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const hashedRefreshToken = await bcrypt.hash(tokens.refreshToken, 10);

    await this.prisma.client.user.update({
      where: { id: user.id },
      data: {
        refreshToken: hashedRefreshToken,
      },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  // forgot password
  async forgotPassword(payload: ForgotPasswordDto) {
    const { email } = payload;
    const user = await this.prisma.client.user.findUnique({
      where: { email },
    });

    if (!user) {
      return {
        message:
          'If an account exists with this email, a reset code has been sent',
      };
    }

    if (user.provider !== AuthProvider.EMAIL) {
      return {
        message:
          'If an account exists with this email, a reset code has been sent',
      };
    }

    const code = this.generateSixDigitCode();
    const hashedCode = await this.hashValue(code);

    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await this.prisma.client.user.update({
      where: { email },
      data: {
        resetCode: hashedCode,
        resetCodeExpiry: expiry,
        resetVerified: false,
      },
    });

    await this.mailService.sendResetCode(email, code);
    console.log('Sending email to:', email, 'Code:', code);

    return {
      message:
        'If an account exists with this email, a reset code has been sent',
    };
  }

  // verify reset code
  async verifyResetCode(payload: VerifyResetCodeDto) {
    const { email, code } = payload;

    const user = await this.prisma.client.user.findUnique({
      where: { email },
    });

    if (!user || !user.resetCode || !user.resetCodeExpiry) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    if (user.resetCodeExpiry.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    const isMatched = await bcrypt.compare(code, user.resetCode);

    if (!isMatched) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    await this.prisma.client.user.update({
      where: { email },
      data: {
        resetVerified: true,
      },
    });

    return {
      message: 'Code verified successfully',
    };
  }

  // reset password
  async resetPassword(payload: ResetPasswordDto) {
    const { email, newPassword, confirmPassword } = payload;

    if (newPassword !== confirmPassword) {
      throw new BadRequestException(
        'Password and confirm password do not match',
      );
    }

    const user = await this.prisma.client.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.resetVerified) {
      throw new UnauthorizedException('Reset code is not verified');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.client.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        resetCode: null,
        resetCodeExpiry: null,
        resetVerified: false,
        refreshToken: null,
      },
    });

    return {
      message: 'Password reset successfully',
    };
  }

  private generateSixDigitCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async hashValue(value: string) {
    return bcrypt.hash(value, 10);
  }
}
