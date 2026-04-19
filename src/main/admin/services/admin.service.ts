import { PrismaService } from '@/lib/prisma/prisma.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly userListSelect = {
    id: true,
    name: true,
    email: true,
    role: true,
    status: true,
    avatarUrl: true,
    avatarPublicId: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  async getAllStudents() {
    const students = await this.prisma.client.user.findMany({
      where: {
        role: UserRole.STUDENT,
      },
      select: this.userListSelect,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      message: 'Students fetched successfully',
      data: students,
    };
  }

  async getAllTutors() {
    const tutors = await this.prisma.client.user.findMany({
      where: {
        role: UserRole.TUTOR,
      },
      select: this.userListSelect,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      message: 'Tutors fetched successfully',
      data: tutors,
    };
  }

  async updateUserStatus(userId: string, status: UserStatus) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: this.userListSelect,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException(
        'Admin accounts cannot be updated from this route',
      );
    }

    if (![UserRole.STUDENT, UserRole.TUTOR].includes(user.role)) {
      throw new BadRequestException(
        'Only student and tutor accounts can be updated from this route',
      );
    }

    const updatedUser =
      user.status === status
        ? user
        : await this.prisma.client.user.update({
            where: { id: userId },
            data: {
              status,
              refreshToken: status === UserStatus.ACTIVE ? undefined : null,
            },
            select: this.userListSelect,
          });

    return {
      message: `${user.role.toLowerCase()} status updated to ${status.toLowerCase()} successfully`,
      data: updatedUser,
    };
  }
}
