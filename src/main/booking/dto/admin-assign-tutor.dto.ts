import {
  Equals,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class AdminAssignTutorDto {
  @IsUUID()
  tutorId!: string;

  @IsDateString()
  scheduledAt!: string;

  @IsInt()
  @Equals(50, { message: 'durationMinutes must be 50' })
  durationMinutes!: number;

  @IsOptional()
  @IsString()
  topic?: string;

  @IsOptional()
  @IsString()
  courseReference?: string;

  @IsOptional()
  @IsString()
  moduleReference?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
