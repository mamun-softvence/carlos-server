import { IsEnum, IsOptional } from 'class-validator';
import { LessonType } from '@prisma/client';

export class StudentBookAvailabilityDto {
  @IsOptional()
  @IsEnum(LessonType)
  lessonType?: LessonType;
}
