import { ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

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

  @ApiPropertyOptional({
    example: '2026-04-25',
    description:
      'Filter bookings for a specific date. Pending bookings use requestedDate; scheduled/completed/cancelled bookings use scheduledAt.',
  })
  @IsOptional()
  @IsDateString()
  date?: string;
}
