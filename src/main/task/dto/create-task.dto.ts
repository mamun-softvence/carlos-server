import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateTaskDto {
  @ApiProperty({
    example: '4b572b45-238e-4011-b3e2-da75fb7a0a44',
    description: 'Student who receives this task/homework',
  })
  @IsUUID()
  studentId!: string;

  @ApiProperty({
    example: 'Algebra worksheet 01',
  })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({
    example: '2026-04-30T18:00:00.000Z',
  })
  @IsDateString()
  dueDate!: string;
}
