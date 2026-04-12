import { Roles } from '@/common/dto/roles.decorator';
import { JwtAuthGuard, RolesGuard } from '@/core/jwt/jwt.guard';
import { Body, Controller, Patch, Post, UseGuards } from '@nestjs/common';
import { TutorAdminService } from '../services/tutor.admin.service';
import { CreateTutorDto } from '../dto/create-tutor.dto';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiTags('Admin')
@Controller('admin/tutors')
export class TutorAdminController {
  constructor(private readonly tutorAdminService: TutorAdminService) {}

  @ApiBearerAuth()
  @Post()
  @ApiOperation({
    summary: 'Create tutor',
    description: 'Admin can create a new tutor account.',
  })
  @ApiBody({
    type: CreateTutorDto,
    description: 'Tutor creation payload',
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
    },
  })
  createTutor(@Body() dto: CreateTutorDto) {
    return this.tutorAdminService.createTutor(dto);
  }
}
