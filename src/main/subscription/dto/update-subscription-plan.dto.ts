import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateSubscriptionPlanDto {
  @ApiPropertyOptional({
    example: 'Premium Plan',
    description: 'Subscription plan name',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    example: '999.00',
    description: 'Plan price as a decimal string',
  })
  @IsOptional()
  @IsNumberString()
  price?: string;

  @ApiPropertyOptional({
    example: '30',
    description: 'Plan duration in days',
  })
  @IsOptional()
  @IsNumberString()
  durationDays?: string;

  @ApiPropertyOptional({
    example: '12',
    description: 'Credits allowed per month',
  })
  @IsOptional()
  @IsNumberString()
  creditsPerMonth?: string;

  @ApiPropertyOptional({
    example: {
      sessionsPerMonth: 12,
      support: 'priority',
    },
    description: 'Simple JSON features object for the plan',
  })
  @IsOptional()
  @IsObject()
  features?: Record<string, unknown>;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the plan is active',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    example: 'usd',
    description: 'Stripe currency code',
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    example: 'month',
    enum: ['day', 'week', 'month', 'year'],
    description: 'Stripe recurring billing interval',
  })
  @IsOptional()
  @IsIn(['day', 'week', 'month', 'year'])
  billingInterval?: 'day' | 'week' | 'month' | 'year';
}
