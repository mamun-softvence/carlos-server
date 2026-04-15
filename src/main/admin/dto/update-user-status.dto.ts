import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateUserStatusDto {
  @ApiProperty({
    example: UserStatus.SUSPENDED,
    enum: UserStatus,
    description: 'New account status for the target user',
  })
  @IsEnum(UserStatus)
  status!: UserStatus;
}
