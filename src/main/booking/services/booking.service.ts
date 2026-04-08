/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { PrismaService } from '@/lib/prisma/prisma.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingCreatedBy, BookingStatus, UserRole } from '@prisma/client';
import { StudentCreateBookingRequestDto } from '../dto/student-create-booking-request.dto';
import { AdminAssignTutorDto } from '../dto/admin-assign-tutor.dto';
import { TutorCreateBookingDto } from '../dto/tutor-create-booking.dto';

@Injectable()
export class BookingService {
  constructor(private readonly prisma: PrismaService) {}
  private async ensureUserExists(userId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.status) {
      throw new BadRequestException('User is inactive');
    }

    return user;
  }

  private async ensureUserRole(userId: string, role: UserRole) {
    const user = await this.ensureUserExists(userId);

    if (user.role !== role) {
      throw new BadRequestException(`User is not a ${role.toLowerCase()}`);
    }

    return user;
  }

  //   private buildQueryWhere(dto: BookingQueryDto) {
  //     const where: any = {};

  //     if (dto.status) {
  //       where.status = dto.status;
  //     }

  //     if (dto.search) {
  //       where.OR = [
  //         { topic: { contains: dto.search, mode: 'insensitive' } },
  //         { note: { contains: dto.search, mode: 'insensitive' } },
  //         { student: { name: { contains: dto.search, mode: 'insensitive' } } },
  //         { tutor: { name: { contains: dto.search, mode: 'insensitive' } } },
  //       ];
  //     }

  //     return where;
  //   }
  async createStudentRequest(
    studentId: string,
    dto: StudentCreateBookingRequestDto,
  ) {
    await this.ensureUserRole(studentId, UserRole.STUDENT);

    const booking = await this.prisma.client.booking.create({
      data: {
        studentId,
        createdBy: BookingCreatedBy.STUDENT,
        status: BookingStatus.PENDING,
        topic: dto.topic,
        note: dto.note,
        requestedDate: dto.requestedDate ? new Date(dto.requestedDate) : null,
        requestedTimeLabel: dto.requestedTimeLabel,
      },
      include: {
        student: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
    });

    return {
      message: 'Booking request created successfully',
      data: booking,
    };
  }

  async assignTutor(
    adminId: string,
    bookingId: string,
    dto: AdminAssignTutorDto,
  ) {
    console.log(adminId);
    await this.ensureUserRole(adminId, UserRole.ADMIN);
    await this.ensureUserRole(dto.tutorId, UserRole.TUTOR);

    return this.prisma.client.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
      });

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      if (booking.status === BookingStatus.CANCELLED) {
        throw new BadRequestException(
          'Cannot assign tutor to cancelled booking',
        );
      }

      if (booking.status === BookingStatus.COMPLETED) {
        throw new BadRequestException(
          'Cannot assign tutor to completed booking',
        );
      }

      const scheduledAt = new Date(dto.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) {
        throw new BadRequestException('Invalid scheduledAt date');
      }

      const conflictingBooking = await tx.booking.findFirst({
        where: {
          tutorId: dto.tutorId,
          status: BookingStatus.SCHEDULED,
          scheduledAt,
        },
      });

      if (conflictingBooking && conflictingBooking.id !== bookingId) {
        throw new BadRequestException(
          'Tutor already has a scheduled class at this time',
        );
      }

      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          tutorId: dto.tutorId,
          assignedByAdminId: adminId,
          scheduledAt,
          durationMinutes: dto.durationMinutes,
          topic: dto.topic ?? booking.topic,
          note: dto.note ?? booking.note,
          status: BookingStatus.SCHEDULED,
        },
        include: {
          student: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
          tutor: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
          assignedByAdmin: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      return {
        message: 'Tutor assigned successfully',
        data: updated,
      };
    });
  }

  async tutorCreateBooking(tutorId: string, dto: TutorCreateBookingDto) {
    await this.ensureUserRole(tutorId, UserRole.TUTOR);
    await this.ensureUserRole(dto.studentId, UserRole.STUDENT);

    const scheduledAt = new Date(dto.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduledAt date');
    }

    const conflict = await this.prisma.client.booking.findFirst({
      where: {
        tutorId,
        status: BookingStatus.SCHEDULED,
        scheduledAt,
      },
    });

    if (conflict) {
      throw new BadRequestException(
        'You already have a scheduled class at this time',
      );
    }

    const booking = await this.prisma.client.booking.create({
      data: {
        studentId: dto.studentId,
        tutorId,
        createdBy: BookingCreatedBy.TUTOR,
        status: BookingStatus.SCHEDULED,
        scheduledAt,
        durationMinutes: dto.durationMinutes,
        topic: dto.topic,
        note: dto.note,
      },
      include: {
        student: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        tutor: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
    });

    return {
      message: 'Class scheduled successfully',
      data: booking,
    };
  }

  // Cancle booking
  async cancelBooking(
    actorId: string,
    bookingId: string,
    actorRole: UserRole,
    cancelReason?: string,
  ) {
    const booking = await this.prisma.client.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Booking already cancelled');
    }

    const isStudentOwner =
      actorRole === UserRole.STUDENT &&
      booking.studentId &&
      booking.studentId === actorId;

    const isTutorOwner =
      actorRole === UserRole.TUTOR && booking.tutorId === actorId;
    const isAdmin = actorRole === UserRole.ADMIN;

    if (!isStudentOwner && !isTutorOwner && !isAdmin) {
      throw new ForbiddenException('You cannot cancel this booking');
    }

    const updated = await this.prisma.client.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason,
      },
      include: {
        student: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        tutor: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
    });
    return {
      message: 'Booking cancelled successfully',
      data: updated,
    };
  }
}
