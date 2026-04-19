import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class UpdateBookingRuleDto {
  @ApiProperty({
    example: 24,
    description: 'Set minimum booking notice in hours',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minimumNoticeHours!: number;

  @ApiProperty({
    example: 12,
    description: 'Set cancellation time in hours',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cancellationHours!: number;
}
