import { UserEnum } from '@/common/enum/user.enum';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateTutorDto {
  @ApiProperty({
    example: 'John Doe',
    description: 'Tutor full name',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    example: 'john@example.com',
    description: 'Tutor email address',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: '123456',
    minLength: 6,
    description: 'Tutor account password',
  })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({
    example: UserEnum.TUTOR,
    enum: UserEnum,
    description: 'User role',
  })
  @IsEnum(UserEnum)
  role!: UserEnum;
}
