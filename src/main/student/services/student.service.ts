import { PrismaService } from '@/lib/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class StudentService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyBookings(studentId: string) {
    const bookings = await this.prisma.client.booking.findMany({
      where: {
        studentId,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        tutor: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        assignedByAdmin: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      message: 'Student bookings fetched successfully',
      data: bookings,
    };
  }
}
