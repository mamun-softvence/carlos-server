import { PaginationDto } from '@/common/dto/pagination.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class NotificationQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    example: false,
    description: 'Filter read or unread notifications',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true') {
      return true;
    }

    if (value === false || value === 'false') {
      return false;
    }

    return value;
  })
  @IsBoolean()
  isRead?: boolean;

  @ApiPropertyOptional({
    example: 'BOOKING_SCHEDULED',
  })
  @IsOptional()
  @IsString()
  type?: string;
}
