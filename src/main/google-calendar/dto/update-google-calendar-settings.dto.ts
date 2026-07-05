import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateGoogleCalendarSettingsDto {
  @ApiProperty({
    example: true,
  })
  @IsBoolean()
  enabled!: boolean;
}
