import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  CurrentUserData,
} from '@/common/dto/current-user.decorator';
import { JwtAuthGuard, RolesGuard } from '@/core/jwt/jwt.guard';
import { NotificationQueryDto } from '../dto/notification-query.dto';
import { NotificationService } from '../services/notification.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Get authenticated user notifications' })
  getNotifications(
    @CurrentUser() user: CurrentUserData,
    @Query() query: NotificationQueryDto,
  ) {
    return this.notificationService.getNotifications(user.userId, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  getUnreadCount(@CurrentUser() user: CurrentUserData) {
    return this.notificationService.getUnreadCount(user.userId);
  }

  @Patch(':notificationId/read')
  @ApiOperation({ summary: 'Mark one notification as read' })
  markAsRead(
    @CurrentUser() user: CurrentUserData,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ) {
    return this.notificationService.markAsRead(user.userId, notificationId);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllAsRead(@CurrentUser() user: CurrentUserData) {
    return this.notificationService.markAllAsRead(user.userId);
  }
}
