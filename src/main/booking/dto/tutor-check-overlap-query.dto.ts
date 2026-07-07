import { IsDateString, IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class TutorCheckOverlapQueryDto {
  @IsDateString()
  scheduledAt!: string;

  @Type(() => Number)
  @IsInt()
  durationMinutes!: number;

  @IsOptional()
  @IsString()
  excludeId?: string;
}
