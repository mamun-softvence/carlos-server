import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class AdminUserQueryDto {
  @ApiProperty({
    required: false,
    description: 'Page number (default: 1)',
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiProperty({
    required: false,
    description: 'Items per page (default: 10)',
    default: 10,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 10;

  @ApiProperty({
    required: false,
    description: 'Search string to filter users by name or email',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
