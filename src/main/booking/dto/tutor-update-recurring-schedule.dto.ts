import {
  Equals,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { RecurringFrequency } from '@prisma/client';

export class TutorUpdateRecurringScheduleDto {
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(RecurringFrequency)
  frequency?: RecurringFrequency;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;

  @IsOptional()
  @IsString()
  @Matches(/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'timeOfDay must be in HH:MM format',
  })
  timeOfDay?: string;

  @IsOptional()
  @IsInt()
  @Equals(50, { message: 'durationMinutes must be exactly 50' })
  durationMinutes?: number;

  @IsOptional()
  @IsInt()
  @IsIn([1, 2, 3, 7, 30, 60, 90, 120, 180], {
    message: 'openingWindowDays must be 1, 2, 3, 7, 30, 60, 90, 120, or 180',
  })
  openingWindowDays?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
