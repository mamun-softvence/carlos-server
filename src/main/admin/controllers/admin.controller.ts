import { Roles } from '@/common/dto/roles.decorator';
import { JwtAuthGuard, RolesGuard } from '@/core/jwt/jwt.guard';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AdminAnalyticsQueryDto } from '../dto/admin-analytics-query.dto';
import { UpdateUserStatusDto } from '../dto/update-user-status.dto';
import { AdminService } from '../services/admin.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get admin overview statistics' })
  getOverview() {
    return this.adminService.getOverview();
  }

  @Get('revenue-growth')
  @ApiOperation({ summary: 'Get admin revenue growth analytics by year' })
  getRevenueGrowth(@Query() query: AdminAnalyticsQueryDto) {
    return this.adminService.getRevenueGrowth(query);
  }

  @Get('class-distribution')
  @ApiOperation({ summary: 'Get admin class distribution analytics by year' })
  getClassDistribution(@Query() query: AdminAnalyticsQueryDto) {
    return this.adminService.getClassDistribution(query);
  }

  @Get('students')
  @ApiOperation({ summary: 'Get all students' })
  getAllStudents() {
    return this.adminService.getAllStudents();
  }

  @Get('tutors')
  @ApiOperation({ summary: 'Get all tutors' })
  getAllTutors() {
    return this.adminService.getAllTutors();
  }

  @Patch('users/:userId/status')
  @ApiOperation({
    summary: 'Update student or tutor account status',
    description:
      'Admin can suspend, activate, or mark a student/tutor as inactive with a single route.',
  })
  @ApiBody({
    type: UpdateUserStatusDto,
    examples: {
      suspendUser: {
        summary: 'Suspend a student or tutor',
        value: {
          status: 'SUSPENDED',
        },
      },
    },
  })
  updateUserStatus(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.adminService.updateUserStatus(userId, dto.status);
  }
}
