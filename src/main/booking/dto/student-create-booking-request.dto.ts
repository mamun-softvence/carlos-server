import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class StudentCreateBookingRequestDto {
  @ApiPropertyOptional({
    example: 'Higher Math Revision Session',
    description: 'Short title or subject for the booking request',
  })
  @IsOptional()
  @IsString()
  topic?: string;

  @ApiPropertyOptional({
    example: 'Need help with integration, differentiation, and exam prep.',
    description: 'Optional details for the tutor about what the student needs',
  })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({
    example: '2026-04-10',
    description: 'Preferred booking date in ISO format',
  })
  @IsOptional()
  @IsDateString()
  requestedDate?: string;

  @ApiPropertyOptional({
    example: '7:00 PM - 8:00 PM',
    description: 'Preferred time slot label shown to the tutor/admin',
  })
  @IsOptional()
  @IsString()
  requestedTimeLabel?: string;
}
