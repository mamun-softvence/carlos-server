import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request } from 'express';
import { StripeWebhookService } from '../services/stripe-webhook.service';
import { StripeService } from '../services/stripe.service';

@ApiExcludeController()
@Controller('stripe/webhook')
export class StripeWebhookController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly stripeWebhookService: StripeWebhookService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    const event = this.stripeService.constructWebhookEvent(
      request.rawBody,
      signature,
    );

    return this.stripeWebhookService.handleEvent(event);
  }
}
