import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({
    example: 'Can you please review the last homework?',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;
}
