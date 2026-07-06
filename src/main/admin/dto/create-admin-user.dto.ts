import { UserEnum } from '@/common/enum/user.enum';
import { ApiProperty } from '@nestjs/swagger';
import { TutorSubRole } from '@prisma/client';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  MinLength,
  IsArray,
  IsEnum,
  IsOptional,
} from 'class-validator';

const creatableRoles = [UserEnum.STUDENT, UserEnum.TUTOR] as const;

export class CreateAdminUserDto {
  @ApiProperty({
    example: 'John Doe',
    description: 'Student or tutor full name',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    example: 'john@example.com',
    description: 'Student or tutor email address',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: '123456',
    minLength: 6,
    description: 'Initial account password',
  })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({
    example: UserEnum.TUTOR,
    enum: creatableRoles,
    description: 'Only STUDENT or TUTOR can be created from this route',
  })
  @IsIn(creatableRoles)
  role!: (typeof creatableRoles)[number];

  @ApiProperty({
    enum: TutorSubRole,
    isArray: true,
    required: false,
    description: 'The sub-roles assigned to the tutor (only applicable for TUTOR role)',
    example: ['REGULAR', 'CONVERSATION'],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(TutorSubRole, { each: true })
  tutorRoles?: TutorSubRole[];
}
