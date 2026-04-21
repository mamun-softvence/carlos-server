import { ENVEnum } from '@/common/enum/env.enum';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe = require('stripe');

@Injectable()
export class StripeService {
  private readonly stripe?: Stripe.Stripe;
  private readonly webhookSecret?: string;

  constructor(private readonly configService: ConfigService) {
    const secretKey = this.configService.get<string>(ENVEnum.STRIPE_SECRET_KEY);
    this.webhookSecret = this.configService.get<string>(
      ENVEnum.STRIPE_WEBHOOK_SECRET,
    );

    if (secretKey) {
      this.stripe = new Stripe(secretKey);
    }
  }

  get client() {
    if (!this.stripe) {
      throw new InternalServerErrorException('Stripe is not configured');
    }

    return this.stripe;
  }

  constructWebhookEvent(rawBody: Buffer | undefined, signature?: string) {
    if (!rawBody) {
      throw new BadRequestException('Missing raw webhook body');
    }

    if (!signature) {
      throw new BadRequestException('Missing Stripe signature');
    }

    if (!this.webhookSecret) {
      throw new InternalServerErrorException(
        'Stripe webhook secret is not configured',
      );
    }

    try {
      return this.client.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch {
      throw new BadRequestException('Invalid Stripe webhook signature');
    }
  }
}
