/* eslint-disable @typescript-eslint/no-unsafe-assignment */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JWTPayload } from '@/core/jwt/jwt.interface';

export interface CurrentUserData extends JWTPayload {
  userId: string;
  roles?: string[];
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserData => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JWTPayload;

    return {
      ...user,
      userId: user.sub,
      roles: user.role ? [user.role] : undefined,
    };
  },
);
