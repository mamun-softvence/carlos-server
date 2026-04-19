import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class TakeStudentSubscriptionDto {
  @ApiProperty({
    example: '3eaffee1-0a65-4c93-baf8-c34de64713c9',
    description: 'Subscription plan ID',
  })
  @IsUUID()
  @IsNotEmpty()
  planId!: string;
}
