import {
  Equals,
  IsArray,
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

export class OccurrenceConfigItem {
  @IsDate()
  @Type(() => Date)
  scheduledAt!: Date;

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
  @IsEnum(LessonType)
  lessonType?: LessonType;
}

export class TutorCreateRecurringScheduleDto {
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

  @IsEnum(RecurringFrequency)
  frequency!: RecurringFrequency;

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

  @IsString()
  @Matches(/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'timeOfDay must be in HH:MM format',
  })
  timeOfDay!: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startFromDate?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;

  @IsInt()
  @Min(1)
  @Max(5)
  durationHours!: number;

  @IsOptional()
  isPackage?: boolean;

  @IsInt()
  @Min(1)
  @Max(2000)
  openingWindowDays!: number;

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

export class BlockedDateRangeDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'startDate must be in YYYY-MM-DD format',
  })
  startDate!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'endDate must be in YYYY-MM-DD format',
  })
  endDate!: string;
}
