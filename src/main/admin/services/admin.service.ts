import { PrismaService } from '@/lib/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllTutors() {
    const tutors = await this.prisma.client.user.findMany({
      where: {
        role: UserRole.TUTOR,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        avatarUrl: true,
        avatarPublicId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      message: 'Tutors fetched successfully',
      data: tutors,
    };
  }
}
