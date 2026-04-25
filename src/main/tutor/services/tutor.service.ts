import { PrismaService } from '@/lib/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { BookingStatus, Prisma, UserRole } from '@prisma/client';

@Injectable()
export class TutorService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly userSummarySelect = {
    id: true,
    name: true,
    email: true,
    avatarUrl: true,
  } as const;

  private readonly nextSessionSelect = {
    id: true,
    topic: true,
    note: true,
    scheduledAt: true,
    durationMinutes: true,
    status: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.BookingSelect;

  private readonly bookingInclude = {
    student: {
      select: this.userSummarySelect,
    },
    tutor: {
      select: this.userSummarySelect,
    },
    assignedByAdmin: {
      select: {
        id: true,
        name: true,
        email: true,
      },
    },
    participants: {
      select: {
        student: {
          select: this.userSummarySelect,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    },
  } satisfies Prisma.BookingInclude;

  async getMyStudents(tutorId: string) {
    const now = new Date();

    const students = await this.prisma.client.user.findMany({
      where: {
        role: UserRole.STUDENT,
        OR: [
          {
            studentBookings: {
              some: {
                tutorId,
              },
            },
          },
          {
            bookingParticipations: {
              some: {
                booking: {
                  tutorId,
                },
              },
            },
          },
        ],
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
          select: this.nextSessionSelect,
        },
        bookingParticipations: {
          where: {
            booking: {
              tutorId,
              status: BookingStatus.SCHEDULED,
              scheduledAt: {
                gte: now,
              },
            },
          },
          select: {
            booking: {
              select: this.nextSessionSelect,
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const studentsWithNextSession = students.map(
      ({ studentBookings, bookingParticipations, ...student }) => {
        const participantBookings = bookingParticipations.map(
          (participation) => participation.booking,
        );
        const bookingsById = new Map(
          [...studentBookings, ...participantBookings].map((booking) => [
            booking.id,
            booking,
          ]),
        );
        const upcomingBookings = Array.from(bookingsById.values())
          .filter((booking) => booking.scheduledAt)
          .sort(
            (first, second) =>
              (first.scheduledAt?.getTime() ?? 0) -
              (second.scheduledAt?.getTime() ?? 0),
          );

        return {
          ...student,
          nextSession: upcomingBookings[0] ?? null,
        };
      },
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
      include: this.bookingInclude,
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
