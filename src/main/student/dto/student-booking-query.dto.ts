import { ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class StudentBookingQueryDto {
  @ApiPropertyOptional({
    enum: BookingStatus,
    example: BookingStatus.SCHEDULED,
    description:
      'Filter bookings by status: PENDING, SCHEDULED, COMPLETED, or CANCELLED.',
  })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}
