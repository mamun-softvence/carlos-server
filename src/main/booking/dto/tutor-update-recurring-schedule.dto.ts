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
  ValidateNested,
  IsDate,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RecurringFrequency, LessonType } from '@prisma/client';
import {
  OccurrenceConfigItem,
  BlockedDateRangeDto,
} from './tutor-create-recurring-schedule.dto';

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
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  dayOfWeek?: number[];

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
  @IsDate()
  @Type(() => Date)
  startFromDate?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  durationHours?: number;

  @IsOptional()
  @IsBoolean()
  isPackage?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  openingWindowDays?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OccurrenceConfigItem)
  occurrencesConfig?: OccurrenceConfigItem[];

  @IsOptional()
  @IsEnum(LessonType)
  lessonType?: LessonType;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlockedDateRangeDto)
  blockedDateRanges?: BlockedDateRangeDto[];
}
