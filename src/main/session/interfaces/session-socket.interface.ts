import { UserRole } from '@prisma/client';
import { Socket } from 'socket.io';

export type SessionSocketUser = {
  userId: string;
  email: string;
  role: UserRole;
  sub: string;
};

export type SessionSocketData = {
  user?: SessionSocketUser;
  sessionId?: string;
};

export interface AuthenticatedSessionSocket extends Socket {
  data: SessionSocketData;
}
