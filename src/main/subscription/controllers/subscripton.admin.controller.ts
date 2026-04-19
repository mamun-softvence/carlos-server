import { Roles } from '@/common/dto/roles.decorator';
import { JwtAuthGuard, RolesGuard } from '@/core/jwt/jwt.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CreateSubscriptionPlanDto } from '../dto/create-subscription-plan.dto';
import { UpdateSubscriptionPlanDto } from '../dto/update-subscription-plan.dto';
import { SubscriptionAdminService } from '../services/subscripton.admin.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiTags('Admin Subscriptions')
@ApiBearerAuth()
@Controller('admin/subscriptions')
export class SubscriptionAdminController {
  constructor(
    private readonly subscriptionAdminService: SubscriptionAdminService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create subscription plan' })
  @ApiBody({
    type: CreateSubscriptionPlanDto,
    examples: {
      subscriptionPlan: {
        summary: 'Create subscription plan example',
        value: {
          name: 'Basic Plan',
          price: '499.00',
          durationDays: '30',
          creditsPerMonth: '8',
          features: {
            sessionsPerMonth: 8,
            support: 'email',
          },
          isActive: true,
        },
      },
    },
  })
  createSubscription(@Body() dto: CreateSubscriptionPlanDto) {
    return this.subscriptionAdminService.createSubscription(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.STUDENT, UserRole.TUTOR)
  @ApiOperation({ summary: 'Get all subscription plans' })
  getSubscriptions() {
    return this.subscriptionAdminService.getSubscriptions();
  }

  @Patch(':subscriptionId')
  @ApiOperation({ summary: 'Update subscription plan' })
  @ApiBody({
    type: UpdateSubscriptionPlanDto,
    examples: {
      updateSubscriptionPlan: {
        summary: 'Update subscription plan example',
        value: {
          name: 'Premium Plan',
          price: '999.00',
          creditsPerMonth: '12',
          isActive: true,
        },
      },
    },
  })
  updateSubscription(
    @Param('subscriptionId') subscriptionId: string,
    @Body() dto: UpdateSubscriptionPlanDto,
  ) {
    return this.subscriptionAdminService.updateSubscription(
      subscriptionId,
      dto,
    );
  }

  @Delete(':subscriptionId')
  @ApiOperation({ summary: 'Delete subscription plan' })
  deleteSubscription(@Param('subscriptionId') subscriptionId: string) {
    return this.subscriptionAdminService.deleteSubscription(subscriptionId);
  }
}
