import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import {
  CurrentUser,
  CurrentUserData,
} from '@/common/dto/current-user.decorator';
import { Public } from '@/core/jwt/jwt.decorator';
import { JwtAuthGuard, RolesGuard } from '@/core/jwt/jwt.guard';
import { UpdateGoogleCalendarSettingsDto } from './dto/update-google-calendar-settings.dto';
import { GoogleCalendarService } from './google-calendar.service';

@ApiTags('Google Calendar')
@ApiBearerAuth()
@Controller('google-calendar')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GoogleCalendarController {
  constructor(private readonly googleCalendarService: GoogleCalendarService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get Google Calendar connection status' })
  getStatus(@CurrentUser() user: CurrentUserData) {
    return this.googleCalendarService.getStatus(user.userId);
  }

  @Get('connect-url')
  @ApiOperation({ summary: 'Generate Google Calendar connection URL' })
  getConnectUrl(@CurrentUser() user: CurrentUserData) {
    return this.googleCalendarService.getConnectUrl(user.userId);
  }

  @Get('callback')
  @Public()
  @ApiOperation({ summary: 'Handle Google Calendar OAuth callback' })
  @ApiQuery({ name: 'code', required: false, type: String })
  @ApiQuery({ name: 'state', required: false, type: String })
  async handleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ) {
    const redirectUrl = await this.googleCalendarService.handleCallback(
      code,
      state,
    );

    return res.redirect(redirectUrl);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Enable or disable Google Calendar sync' })
  updateSettings(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateGoogleCalendarSettingsDto,
  ) {
    return this.googleCalendarService.updateSettings(user.userId, dto.enabled);
  }

  @Delete('disconnect')
  @ApiOperation({ summary: 'Disconnect Google Calendar from this account' })
  disconnect(@CurrentUser() user: CurrentUserData) {
    return this.googleCalendarService.disconnect(user.userId);
  }
}
