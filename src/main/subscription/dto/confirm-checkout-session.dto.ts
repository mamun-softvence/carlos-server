import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ConfirmCheckoutSessionDto {
  @ApiProperty({
    example:
      'cs_test_a19AQdHCwuRBJfjJkLDuZ59lW6SlvOuf4ltjogQSEll6vNbmVDXXtSH0XI',
    description: 'Stripe Checkout Session ID from success URL session_id',
  })
  @IsString()
  @IsNotEmpty()
  sessionId!: string;
}
