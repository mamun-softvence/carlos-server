import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, ArrayNotEmpty } from 'class-validator';
import { TutorSubRole } from '@prisma/client';

export class UpdateTutorRolesDto {
  @ApiProperty({
    enum: TutorSubRole,
    isArray: true,
    description:
      'The sub-roles assigned to the tutor (must contain at least one role)',
    example: ['REGULAR', 'CONVERSATION'],
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'A teacher must have at least one role assigned' })
  @IsEnum(TutorSubRole, { each: true })
  roles!: TutorSubRole[];
}
