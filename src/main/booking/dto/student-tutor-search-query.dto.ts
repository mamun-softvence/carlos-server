import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { LessonType } from '@prisma/client';
import { SortOrder } from './student-search-bookings.dto';

export enum StudentTutorSortBy {
  RELEVANCE = 'relevance',
  NEXT_AVAILABLE = 'nextAvailable',
  NEWEST = 'newest',
}

export class StudentTutorSearchQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(LessonType)
  lessonType?: LessonType;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  hasAvailability?: boolean;

  @IsOptional()
  @IsEnum(StudentTutorSortBy)
  sortBy?: StudentTutorSortBy;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder;
}
