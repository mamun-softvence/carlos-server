import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class TaskQueryDto {
  @ApiPropertyOptional({
    enum: TaskStatus,
    example: TaskStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({
    example: '4b572b45-238e-4011-b3e2-da75fb7a0a44',
    description: 'Filter tasks by student. Tutor/admin routes only.',
  })
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional({
    example: '97d4ed15-48ab-4e9f-bb46-39561d49513d',
    description: 'Filter tasks by scheduled booking.',
  })
  @IsOptional()
  @IsUUID()
  bookingId?: string;
}
