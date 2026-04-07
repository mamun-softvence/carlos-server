import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { successResponse } from 'src/common/utils/response.util';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { CookieOptions, Request, Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private getAuthCookieOptions(): CookieOptions {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
    };
  }

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    const cookieOptions = this.getAuthCookieOptions();

    res.cookie('accessToken', accessToken, {
      ...cookieOptions,
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.cookie('refreshToken', refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register user with email and password' })
  async register(
    @Body() payload: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(payload);

    this.setAuthCookies(res, result.accessToken, result.refreshToken);

    return successResponse(
      {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      },
      'User registered successfully',
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login user with email and password' })
  async login(
    @Body() payload: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(payload);

    this.setAuthCookies(res, result.accessToken, result.refreshToken);

    return successResponse(
      {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      },
      'User logged in successfully',
    );
  }

  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  async refreshToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    const result = await this.authService.refreshToken(refreshToken);

    this.setAuthCookies(res, result.accessToken, result.refreshToken);

    return successResponse(
      {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      },
      'Token refreshed successfully',
    );
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleLogin() {
    // redirects to Google
  }

  @Get('google/redirect')
  @UseGuards(AuthGuard('google'))
  async googleCallback(
    @Req() req: Request & { user: any },
    @Res() res: Response,
  ) {
    const result = await this.authService.googleLogin(req.user);
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
    const redirectUrl = new URL(frontendUrl);

    redirectUrl.searchParams.set('accessToken', result.accessToken);

    this.setAuthCookies(res, result.accessToken, result.refreshToken);

    return res.redirect(redirectUrl.toString());
  }

  // reset password & code verify
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send password reset code to email' })
  async forgotPassword(@Body() payload: ForgotPasswordDto) {
    const result = await this.authService.forgotPassword(payload);

    return successResponse(result, result.message);
  }

  @Post('verify-reset-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify password reset code' })
  async verifyResetCode(@Body() payload: VerifyResetCodeDto) {
    const result = await this.authService.verifyResetCode(payload);

    return successResponse(result, result.message);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password after code verification' })
  async resetPassword(@Body() payload: ResetPasswordDto) {
    const result = await this.authService.resetPassword(payload);

    return successResponse(result, result.message);
  }
}
