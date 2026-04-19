import { PrismaService } from '@/lib/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { BookingStatus, UserRole } from '@prisma/client';

@Injectable()
export class TutorService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyStudents(tutorId: string) {
    const now = new Date();

    const students = await this.prisma.client.user.findMany({
      where: {
        role: UserRole.STUDENT,
        studentBookings: {
          some: {
            tutorId,
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        avatarPublicId: true,
        createdAt: true,
        updatedAt: true,
        studentBookings: {
          where: {
            tutorId,
            status: BookingStatus.SCHEDULED,
            scheduledAt: {
              gte: now,
            },
          },
          orderBy: {
            scheduledAt: 'asc',
          },
          take: 1,
          select: {
            id: true,
            topic: true,
            note: true,
            scheduledAt: true,
            durationMinutes: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const studentsWithNextSession = students.map(
      ({ studentBookings, ...student }) => ({
        ...student,
        nextSession: studentBookings[0] ?? null,
      }),
    );

    return {
      message: 'Tutor students fetched successfully',
      data: studentsWithNextSession,
    };
  }

  async getMyBookings(tutorId: string) {
    const bookings = await this.prisma.client.booking.findMany({
      where: {
        tutorId,
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
      message: 'Tutor bookings fetched successfully',
      data: bookings,
    };
  }
}
