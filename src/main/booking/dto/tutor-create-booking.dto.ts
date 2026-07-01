import {
  ArrayMinSize,
  ArrayUnique,
  IsDateString,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class TutorCreateBookingDto {
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  studentIds?: string[];

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
