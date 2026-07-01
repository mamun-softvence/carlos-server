import {
  CurrentUser,
  CurrentUserData,
} from '@/common/dto/current-user.decorator';
import { Roles } from '@/common/dto/roles.decorator';
import { JwtAuthGuard, RolesGuard } from '@/core/jwt/jwt.guard';
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ConfirmCheckoutSessionDto } from '../dto/confirm-checkout-session.dto';
import { TakeStudentSubscriptionDto } from '../dto/take-student-subscription.dto';
import { SubscriptionStudentService } from '../services/subscripton.student.service';

@ApiTags('Student Subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@Controller('student/subscriptions')
export class SubscriptionStudentController {
  constructor(
    private readonly subscriptionStudentService: SubscriptionStudentService,
  ) {}

  @Get('current')
  @ApiOperation({
    summary: 'Get current, active, and expired subscriptions for student',
  })
  getCurrentSubscription(@CurrentUser() user: CurrentUserData) {
    return this.subscriptionStudentService.getCurrentSubscription(user.userId);
  }

  @Post('checkout')
  @ApiOperation({ summary: 'Create Stripe checkout session for subscription' })
  @ApiBody({
    type: TakeStudentSubscriptionDto,
    examples: {
      takeStudentSubscription: {
        summary: 'Create checkout session example',
        value: {
          planId: '3eaffee1-0a65-4c93-baf8-c34de64713c9',
        },
      },
    },
  })
  takeSubscription(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: TakeStudentSubscriptionDto,
  ) {
    return this.subscriptionStudentService.takeSubscription(
      user.userId,
      dto.planId,
    );
  }

  @Post()
  @ApiOperation({
    summary: 'Create Stripe checkout session for subscription',
  })
  @ApiBody({
    type: TakeStudentSubscriptionDto,
  })
  createCheckoutSession(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: TakeStudentSubscriptionDto,
  ) {
    return this.subscriptionStudentService.takeSubscription(
      user.userId,
      dto.planId,
    );
  }

  @Post('checkout/confirm')
  @ApiOperation({ summary: 'Confirm Stripe checkout session after redirect' })
  @ApiBody({
    type: ConfirmCheckoutSessionDto,
  })
  confirmCheckoutSession(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: ConfirmCheckoutSessionDto,
  ) {
    return this.subscriptionStudentService.confirmCheckoutSession(
      user.userId,
      dto.sessionId,
    );
  }
}
