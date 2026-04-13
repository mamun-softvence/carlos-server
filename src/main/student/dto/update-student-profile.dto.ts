import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

const normalizeOptionalString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const normalizeOptionalEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const normalizeOptionalBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return value;
};

export class UpdateStudentProfileDto {
  @ApiPropertyOptional({
    example: 'John Doe',
  })
  @IsOptional()
  @Transform(normalizeOptionalString)
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({
    example: 'student@example.com',
  })
  @IsOptional()
  @Transform(normalizeOptionalEmail)
  @IsEmail()
  @IsNotEmpty()
  email?: string;

  @ApiPropertyOptional({
    example: '+8801712345678',
  })
  @IsOptional()
  @Transform(normalizeOptionalString)
  @IsString()
  @IsNotEmpty()
  phoneNumber?: string;

  @ApiPropertyOptional({
    example: 'Asia/Dhaka',
  })
  @IsOptional()
  @Transform(normalizeOptionalString)
  @IsString()
  @IsNotEmpty()
  timeZone?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Enable or disable Google Calendar for the student profile.',
  })
  @IsOptional()
  @Transform(normalizeOptionalBoolean)
  @IsBoolean()
  googleCalendarEnabled?: boolean;
}
