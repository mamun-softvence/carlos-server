import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class TutorCreateBookingDto {
  @IsUUID()
  studentId!: string;

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
  note?: string;
}
