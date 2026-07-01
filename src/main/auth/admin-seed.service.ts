import { ENVEnum } from '@/common/enum/env.enum';
import { PrismaService } from '@/lib/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { AuthProvider, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const email = this.configService.get<string>(ENVEnum.SUPER_ADMIN_EMAIL);
    const password = this.configService.get<string>(ENVEnum.SUPER_ADMIN_PASS);

    if (!email || !password) {
      this.logger.warn(
        'Skipping admin seed because SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASS is missing',
      );
      return;
    }

    const existingAdmin = await this.prisma.client.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingAdmin) {
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await this.prisma.client.user.create({
      data: {
        name: 'Super Admin',
        email,
        password: hashedPassword,
        role: UserRole.ADMIN,
        provider: AuthProvider.EMAIL,
        isEmailVerified: true,
        acceptedTerms: true,
      },
    });

    this.logger.log(`Seed admin created for ${email}`);
  }
}
