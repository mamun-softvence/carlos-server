import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateDirectConversationDto {
  @ApiProperty({
    example: '4b572b45-238e-4011-b3e2-da75fb7a0a44',
    description: 'Tutor, student, or admin user to message directly',
  })
  @IsUUID()
  receiverId!: string;
}
