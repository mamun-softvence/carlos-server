import { PrismaService } from '@/lib/prisma/prisma.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateAdminUserDto } from '../dto/create-admin-user.dto';
import { UpdateTutorRolesDto } from '../dto/update-tutor-roles.dto';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';

@Injectable()
export class TutorAdminService {
  constructor(private prisma: PrismaService) {}

  private readonly studentResponseSelect = {
    id: true,
    name: true,
    email: true,
    role: true,
    status: true,
    avatarUrl: true,
    avatarPublicId: true,
    provider: true,
    isEmailVerified: true,
    acceptedTerms: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  private readonly tutorResponseSelect = {
    id: true,
    name: true,
    email: true,
    role: true,
    status: true,
    avatarUrl: true,
    avatarPublicId: true,
    provider: true,
    isEmailVerified: true,
    acceptedTerms: true,
    tutorRoles: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  async createUser(dto: CreateAdminUserDto) {
    const { name, password, email, role } = dto;

    const existing = await this.prisma.client.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new BadRequestException('Email already exists');
    }

    // 2️⃣ Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    if (![UserRole.STUDENT, UserRole.TUTOR].includes(role)) {
      throw new BadRequestException('Role must be STUDENT or TUTOR');
    }

    const isTutor = role === UserRole.TUTOR;

    const user = await this.prisma.client.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        tutorRoles: isTutor ? ['REGULAR'] : undefined,
      },
      select: isTutor ? this.tutorResponseSelect : this.studentResponseSelect,
    });

    return {
      message: `${role.toLowerCase()} created successfully`,
      data: user,
    };
  }

  async deleteUser(userId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException(
        'Admin accounts cannot be deleted from this route',
      );
    }

    if (![UserRole.STUDENT, UserRole.TUTOR].includes(user.role)) {
      throw new BadRequestException(
        'Only student and tutor accounts can be deleted from this route',
      );
    }

    const isTutor = user.role === UserRole.TUTOR;

    const deleted = await this.prisma.client.user.delete({
      where: {
        id: userId,
      },
      select: isTutor ? this.tutorResponseSelect : this.studentResponseSelect,
    });

    return {
      message: `${user.role.toLowerCase()} deleted successfully`,
      data: deleted,
    };
  }

  async updateTutorRoles(tutorId: string, dto: UpdateTutorRolesDto) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: tutorId },
    });

    if (!user) {
      throw new NotFoundException('Tutor not found');
    }

    if (user.role !== UserRole.TUTOR) {
      throw new BadRequestException('User is not a tutor');
    }

    const updated = await this.prisma.client.user.update({
      where: { id: tutorId },
      data: {
        tutorRoles: dto.roles,
      },
      select: this.tutorResponseSelect,
    });

    return {
      message: 'Tutor roles updated successfully',
      data: updated,
    };
  }
}
