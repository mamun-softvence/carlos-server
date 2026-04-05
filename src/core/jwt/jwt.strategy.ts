import { ENVEnum } from "@/common/enum/env.enum";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JWTPayload } from "./jwt.interface";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@/lib/prisma/prisma.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy){
    constructor(
        private readonly config: ConfigService,
        private readonly prisma: PrismaService
    ){
        const jwtSecret = config.getOrThrow<string>(ENVEnum.JWT_ACCESS_SECRET);
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            secretOrKey: jwtSecret
        })
    }

    async validate(payload: JWTPayload){
        const user = await this.prisma.client.user.findUnique({
            where: { id: payload.sub }
        })
        if(!user){
            throw new UnauthorizedException('User not found')
        }
        return payload;
    }
}