import { PrismaService } from '@/lib/prisma/prisma.service';
import { Prisma, UserRole } from '@prisma/client';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StudentBookingQueryDto } from '../dto/student-booking-query.dto';
import { UpdateStudentProfileDto } from '../dto/update-student-profile.dto';

@Injectable()
export class StudentService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly studentProfileSelect = {
    id: true,
    name: true,
    email: true,
    phoneNumber: true,
    timeZone: true,
    googleCalendarEnabled: true,
    role: true,
    avatarUrl: true,
    avatarPublicId: true,
    isEmailVerified: true,
    status: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  async getMyCredits(studentId: string) {
    const student = await this.prisma.client.user.findFirst({
      where: {
        id: studentId,
        role: UserRole.STUDENT,
      },
      select: {
        id: true,
      },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const creditBalance =
      await this.prisma.client.studentCreditBalance.findUnique({
        where: {
          studentId,
        },
        select: {
          totalCredits: true,
        },
      });

    return {
      message: 'Student credit balance fetched successfully',
      data: {
        totalCredits: creditBalance?.totalCredits ?? 0,
      },
    };
  }

  async getMyBookings(studentId: string, query: StudentBookingQueryDto) {
    const where: Prisma.BookingWhereInput = {
      studentId,
    };

    if (query.status) {
      where.status = query.status;
    }

    const bookings = await this.prisma.client.booking.findMany({
      where,
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

  async updateProfile(studentId: string, dto: UpdateStudentProfileDto) {
    const student = await this.prisma.client.user.findFirst({
      where: {
        id: studentId,
        role: UserRole.STUDENT,
      },
      select: {
        id: true,
      },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    if (dto.email) {
      const existingUser = await this.prisma.client.user.findFirst({
        where: {
          email: dto.email,
          NOT: {
            id: studentId,
          },
        },
        select: {
          id: true,
        },
      });

      if (existingUser) {
        throw new ConflictException('User already exists with this email');
      }
    }

    const updatedStudent = await this.prisma.client.user.update({
      where: { id: studentId },
      data: {
        name: dto.name,
        email: dto.email,
        phoneNumber: dto.phoneNumber,
        timeZone: dto.timeZone,
        googleCalendarEnabled: dto.googleCalendarEnabled,
      },
      select: this.studentProfileSelect,
    });

    return {
      message: 'Student profile updated successfully',
      data: updatedStudent,
    };
  }
}
