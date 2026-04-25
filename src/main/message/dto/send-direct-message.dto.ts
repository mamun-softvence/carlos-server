import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class SendDirectMessageDto {
  @ApiProperty({
    example: '4b572b45-238e-4011-b3e2-da75fb7a0a44',
    description: 'Tutor, student, or admin user to message directly',
  })
  @IsUUID()
  receiverId!: string;

  @ApiProperty({
    example: 'Can you please review the last homework?',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;
}
