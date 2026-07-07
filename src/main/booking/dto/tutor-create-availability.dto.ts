import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TutorCreateAvailabilityItemDto {
  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(180)
  durationMinutes?: number;
}

export class TutorCreateAvailabilityDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TutorCreateAvailabilityItemDto)
  slots!: TutorCreateAvailabilityItemDto[];
}
