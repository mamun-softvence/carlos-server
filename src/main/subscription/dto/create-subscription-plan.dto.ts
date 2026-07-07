import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
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

  @ApiProperty({
    example: 'usd',
    required: false,
    description: 'Stripe currency code',
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({
    example: 'month',
    required: false,
    enum: ['day', 'week', 'month', 'year'],
    description: 'Stripe recurring billing interval',
  })
  @IsOptional()
  @IsIn(['day', 'week', 'month', 'year'])
  billingInterval?: 'day' | 'week' | 'month' | 'year';
}
