import {
  ArrayMinSize,
  ArrayUnique,
  Equals,
  IsDateString,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
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
