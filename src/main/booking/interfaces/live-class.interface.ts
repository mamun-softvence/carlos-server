import { UserRole } from '@prisma/client';

export interface LiveClassParticipant {
  socketId: string;
  userId: string;
  role: UserRole;
}

export interface LiveClassSocketUser {
  userId: string;
  email: string;
  role: UserRole;
  sub: string;
}
