import { PrismaService } from '@/lib/prisma/prisma.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateAdminUserDto } from '../dto/create-admin-user.dto';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';

@Injectable()
export class TutorAdminService {
  constructor(private prisma: PrismaService) {}

  private readonly userResponseSelect = {
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

    const user = await this.prisma.client.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
      },
      select: this.userResponseSelect,
    });

    return {
      message: `${role.toLowerCase()} created successfully`,
      data: user,
    };
  }
}
