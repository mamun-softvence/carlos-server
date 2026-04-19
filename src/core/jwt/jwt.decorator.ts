import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { IS_PUBLIC_KEY, ROLES_KEY } from './jwt.constants';
import { UserEnum } from '@/common/enum/user.enum';
import type { JWTPayload, RequestWithUser } from './jwt.interface';

export const Roles = (...roles: UserEnum[]) => SetMetadata(ROLES_KEY, roles);
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const GetUser = () =>
  createParamDecorator(
    <K extends keyof JWTPayload>(
      data: K | undefined,
      ctx: ExecutionContext,
    ): JWTPayload | JWTPayload[K] | undefined => {
      const request = ctx.switchToHttp().getRequest<RequestWithUser>();
      const user = request.user;
      if (!user) {
        return undefined;
      }
      if (!data) {
        return user;
      }
      return user[data];
    },
  );
