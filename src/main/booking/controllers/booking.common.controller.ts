import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
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
}
