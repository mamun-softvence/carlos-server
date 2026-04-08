import { PrismaService } from '@/lib/prisma/prisma.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateTutorDto } from '../dto/create-tutor.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class TutorAdminService {
  constructor(private prisma: PrismaService) {}

  async createTutor(dto: CreateTutorDto) {
    const { name, password, email, role } = dto;

    const existing = await this.prisma.client.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new BadRequestException('Email already exists');
    }

    // 2️⃣ Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const tutor = await this.prisma.client.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
      },
    });

    return {
      message: 'Tutor created successfully',
      data: tutor,
    };
  }
}
