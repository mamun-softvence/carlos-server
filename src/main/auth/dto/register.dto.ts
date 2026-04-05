import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    example: 'user@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({
    example: 'Test@123',
    description:
      'Minimum 8 characters, at least one uppercase, one lowercase, one number, and one special character',
  })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])/, {
    message: 'Password must contain at least one lowercase letter',
  })
  @Matches(/^(?=.*[A-Z])/, {
    message: 'Password must contain at least one uppercase letter',
  })
  @Matches(/^(?=.*\d)/, {
    message: 'Password must contain at least one number',
  })
  @Matches(/^(?=.*[!@#$%^&*(),.?":{}|<>_\-\\/\[\]])/, {
    message: 'Password must contain at least one special character',
  })
  password!: string;

  @ApiProperty({
    example: 'Test@123',
  })
  @IsString()
  @IsNotEmpty()
  confirmPassword!: string;

  @ApiProperty({
    example: true,
  })
  @IsBoolean()
  acceptedTerms!: boolean;
}
