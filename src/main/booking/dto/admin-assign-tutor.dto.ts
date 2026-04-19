import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class AdminAssignTutorDto {
  @IsUUID()
  tutorId!: string;

  @IsDateString()
  scheduledAt!: string;

  @IsInt()
  @Min(1)
  @Max(300)
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
