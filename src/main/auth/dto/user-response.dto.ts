import { UserRole } from '@prisma/client';

export class UserResponseDto {
  id!: string;
  name!: string | null;
  email!: string;
  role!: UserRole;
  isEmailVerified!: boolean;
  acceptedTerms!: boolean;
  status!: string;
  createdAt!: Date;
  updatedAt!: Date;
}
