import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateSubscriptionPlanDto {
  @ApiProperty({
    example: 'Basic Plan',
    description: 'Subscription plan name',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    example: '499.00',
    description: 'Plan price as a decimal string',
  })
  @IsNumberString()
  price!: string;

  @ApiProperty({
    example: '30',
    description: 'Plan duration in days',
  })
  @IsNumberString()
  durationDays!: string;

  @ApiProperty({
    example: '8',
    description: 'Credits allowed per month',
  })
  @IsNumberString()
  creditsPerMonth!: string;

  @ApiProperty({
    example: {
      sessionsPerMonth: 8,
      support: 'email',
    },
    description: 'Simple JSON features object for the plan',
  })
  @IsObject()
  features!: Record<string, unknown>;

  @ApiProperty({
    example: true,
    required: false,
    description: 'Whether the plan is active',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
