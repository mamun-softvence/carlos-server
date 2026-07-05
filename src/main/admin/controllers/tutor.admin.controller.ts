import { Roles } from '@/common/dto/roles.decorator';
import { JwtAuthGuard, RolesGuard } from '@/core/jwt/jwt.guard';
import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TutorAdminService } from '../services/tutor.admin.service';
import { CreateAdminUserDto } from '../dto/create-admin-user.dto';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiTags('Admin')
@Controller('admin/users')
export class TutorAdminController {
  constructor(private readonly tutorAdminService: TutorAdminService) {}

  @ApiBearerAuth()
  @Post()
  @ApiOperation({
    summary: 'Create student or tutor',
    description:
      'Admin can create a new student or tutor account based on the role field.',
  })
  @ApiBody({
    type: CreateAdminUserDto,
    description: 'Student or tutor creation payload',
    examples: {
      tutorExample: {
        summary: 'Create tutor example',
        value: {
          name: 'John Doe',
          email: 'john@example.com',
          password: '123456',
          role: 'TUTOR',
        },
      },
      studentExample: {
        summary: 'Create student example',
        value: {
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: '123456',
          role: 'STUDENT',
        },
      },
    },
  })
  createUser(@Body() dto: CreateAdminUserDto) {
    return this.tutorAdminService.createUser(dto);
  }

  @ApiBearerAuth()
  @Delete(':userId')
  @ApiOperation({
    summary: 'Delete student or tutor',
    description:
      'Admin can permanently delete a student or tutor account. Admin accounts cannot be deleted from this route.',
  })
  deleteUser(@Param('userId') userId: string) {
    return this.tutorAdminService.deleteUser(userId);
  }
}
