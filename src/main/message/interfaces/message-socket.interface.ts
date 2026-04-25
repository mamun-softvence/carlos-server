import { UserRole } from '@prisma/client';
import { Socket } from 'socket.io';

export type MessageSocketUser = {
  userId: string;
  email: string;
  role: UserRole;
  sub: string;
};

export type MessageSocketData = {
  user?: MessageSocketUser;
  conversationId?: string;
};

export interface AuthenticatedMessageSocket extends Socket {
  data: MessageSocketData;
}
