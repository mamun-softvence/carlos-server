

import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { IS_PUBLIC_KEY, ROLES_KEY } from "./jwt.constants";
import { UserEnum } from "@/common/enum/user.enum";
import type { RequestWithUser } from "./jwt.interface";

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
    constructor(private reflector: Reflector){
        super();
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass()
        ])
        if(isPublic) return true
        const activate = (await super.canActivate(context)) as boolean
        return activate;
    }

    handleRequest(err: any, user: any){
        if(err){
            throw err
        }
        if(!user){
            throw new UnauthorizedException('Unauthotized');
        }
        return user
    }

}

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector){} //metadata porar jonne use kora hoy reflector
    
    canActivate(context: ExecutionContext): boolean { //context muloto request data porar jonne neya hoy
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass()
        ])
        if(isPublic) return true

        const requiredRoles = this.reflector.getAllAndOverride<UserEnum[]>(ROLES_KEY, [context.getHandler(), context.getClass()])

        if(!requiredRoles || requiredRoles.length === 0) return true

        const request = context.switchToHttp().getRequest<RequestWithUser>();
        const user = request.user;

        if(!user?.role) {
            throw new ForbiddenException('User roles are not found')
        }
        const userRoles = Array.isArray(user.role) ? user.role : [user.role];

    const hasRole = requiredRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
    }
}
