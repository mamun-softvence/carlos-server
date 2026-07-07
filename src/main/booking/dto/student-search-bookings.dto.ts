import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { LessonType } from '@prisma/client';

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class StudentSearchBookingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 10;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.ASC;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(LessonType)
  lessonType?: LessonType;
}
