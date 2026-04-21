import { Module } from '@nestjs/common';
import { SubscriptionAdminController } from './controllers/subscripton.admin.controller';
import { SubscriptionStudentController } from './controllers/subscripton.student.controller';
import { StripeWebhookController } from './controllers/stripe-webhook.controller';
import { SubscriptionAdminService } from './services/subscripton.admin.service';
import { SubscriptionStudentService } from './services/subscripton.student.service';
import { StripeWebhookService } from './services/stripe-webhook.service';
import { StripeService } from './services/stripe.service';

@Module({
  controllers: [
    SubscriptionAdminController,
    SubscriptionStudentController,
    StripeWebhookController,
  ],
  providers: [
    SubscriptionAdminService,
    SubscriptionStudentService,
    StripeService,
    StripeWebhookService,
  ],
})
export class SubscriptionModule {}
