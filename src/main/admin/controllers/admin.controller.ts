import { Roles } from '@/common/dto/roles.decorator';
import { JwtAuthGuard, RolesGuard } from '@/core/jwt/jwt.guard';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AdminService } from '../services/admin.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

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
}
