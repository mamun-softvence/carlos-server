import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from '@/core/jwt/jwt.guard';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { BookingService } from '../services/booking.service';
import {
  CurrentUser,
  CurrentUserData,
} from '@/common/dto/current-user.decorator';
import { UpdateBookingStatusDto } from '../dto/update-booking-status.dto';
import { SendLiveClassMessageDto } from '../dto/send-live-class-message.dto';

@ApiTags('Bookings')
@ApiBearerAuth()
@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BookingCommonController {
  constructor(private readonly bookingService: BookingService) {}

  @Patch(':bookingId/cancel')
  @ApiOperation({
    summary: 'Cancel a booking',
    description:
      'Allows the booking owner or an admin to cancel a booking. You can include an optional cancellation reason in the request body.',
  })
  @ApiParam({
    name: 'bookingId',
    description: 'Unique ID of the booking to cancel',
    example: 'd9f31a29-2b7a-4b34-9c77-2c1960a9a7e5',
  })
  @ApiBody({
    type: UpdateBookingStatusDto,
    examples: {
      cancelBooking: {
        summary: 'Cancel booking request example',
        value: {
          cancelReason: 'Student is unavailable at the scheduled time.',
        },
      },
    },
  })
  cancel(
    @CurrentUser() user: CurrentUserData,
    @Param('bookingId') bookingId: string,
    @Body() dto: UpdateBookingStatusDto,
  ) {
    return this.bookingService.cancelBooking(
      user.userId,
      bookingId,
      user.role,
      dto.cancelReason,
    );
  }

  @Get(':bookingId/live-class')
  @ApiOperation({
    summary:
      'Get live-class details for a booking, including scheduling and access status',
  })
  getLiveClass(
    @CurrentUser() user: CurrentUserData,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookingService.getLiveClassByBookingId(
      user.userId,
      user.role,
      bookingId,
    );
  }

  @Get(':bookingId/live-class/messages')
  @ApiOperation({ summary: 'Get persisted chat messages for a booking live class' })
  getLiveClassMessages(
    @CurrentUser() user: CurrentUserData,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookingService.getLiveClassMessages(
      user.userId,
      user.role,
      bookingId,
    );
  }

  @Patch(':bookingId/live-class/start')
  @ApiOperation({ summary: 'Start a scheduled live class' })
  startLiveClass(
    @CurrentUser() user: CurrentUserData,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookingService.startLiveClass(user.userId, bookingId);
  }

  @Patch(':bookingId/live-class/end')
  @ApiOperation({ summary: 'End an active live class' })
  endLiveClass(
    @CurrentUser() user: CurrentUserData,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookingService.endLiveClass(user.userId, bookingId);
  }

  @Patch(':bookingId/live-class/messages')
  @ApiOperation({ summary: 'Persist a live-class chat message' })
  @ApiBody({ type: SendLiveClassMessageDto })
  createLiveClassMessage(
    @CurrentUser() user: CurrentUserData,
    @Param('bookingId') bookingId: string,
    @Body() dto: SendLiveClassMessageDto,
  ) {
    return this.bookingService.createLiveClassMessage(
      user.userId,
      user.role,
      bookingId,
      dto.message,
    );
  }
}
