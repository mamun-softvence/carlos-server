import { UserRole } from '@prisma/client';
import { Expose } from 'class-transformer';

export class UserResponseDto {
  @Expose()
  id!: string;

  // ===== Identity =====
  @Expose()
  name!: string;

  @Expose()
  email!: string;

  // ===== Settings =====
  @Expose()
  role!: UserRole;

  // ===== Avatar =====
  @Expose()
  profilePictureId?: string;

  @Expose()
  profilePictureUrl?: string;

  // ===== Meta =====
  @Expose()
  createdAt!: Date;

  @Expose()
  updatedAt!: Date;
}