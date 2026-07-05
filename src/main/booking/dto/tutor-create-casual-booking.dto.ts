import {
  Equals,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  Max,
} from 'class-validator';

export class TutorCreateCasualBookingDto {
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

  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsInt()
  @Equals(50, { message: 'durationMinutes must be exactly 50' })
  durationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  durationHours?: number;
}
