import { PaginationDto } from '@/common/dto/pagination.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class AdminStudentLogQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    enum: BookingStatus,
    example: BookingStatus.SCHEDULED,
    description: 'Optional booking status filter for booking history routes.',
  })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}
