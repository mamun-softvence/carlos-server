import { ENVEnum } from '@/common/enum/env.enum';
import { PrismaService } from '@/lib/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { AuthProvider, TutorSubRole, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminSeedService.name);
  private readonly defaultStudentEmail = 'arifurrahmanarif223@gmail.com';
  private readonly defaultTutorEmail = 'arifhassanaj@gmail.com';
  private readonly defaultSeedPassword = '123456';

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const seedUsers: Array<{
      label: string;
      name: string;
      role: UserRole;
      email?: string;
      password?: string;
      tutorRoles?: TutorSubRole[];
    }> = [
      {
        label: 'admin',
        name: 'Super Admin',
        role: UserRole.ADMIN,
        email: this.configService.get<string>(ENVEnum.SUPER_ADMIN_EMAIL),
        password: this.configService.get<string>(ENVEnum.SUPER_ADMIN_PASS),
      },
      {
        label: 'student',
        name: 'Seed Student',
        role: UserRole.STUDENT,
        email:
          this.configService.get<string>(ENVEnum.SEED_STUDENT_EMAIL) ??
          this.defaultStudentEmail,
        password:
          this.configService.get<string>(ENVEnum.SEED_STUDENT_PASS) ??
          this.defaultSeedPassword,
      },
      {
        label: 'tutor',
        name: 'Seed Tutor',
        role: UserRole.TUTOR,
        email:
          this.configService.get<string>(ENVEnum.SEED_TUTOR_EMAIL) ??
          this.defaultTutorEmail,
        password:
          this.configService.get<string>(ENVEnum.SEED_TUTOR_PASS) ??
          this.defaultSeedPassword,
        tutorRoles: [TutorSubRole.REGULAR],
      },
    ];

    for (const seedUser of seedUsers) {
      if (!seedUser.email || !seedUser.password) {
        this.logger.warn(
          `Skipping ${seedUser.label} seed because email or password is missing`,
        );
        continue;
      }

      const existingUser = await this.prisma.client.user.findUnique({
        where: { email: seedUser.email },
        select: { id: true },
      });

      if (existingUser) {
        continue;
      }

      const hashedPassword = await bcrypt.hash(seedUser.password, 10);

      await this.prisma.client.user.create({
        data: {
          name: seedUser.name,
          email: seedUser.email,
          password: hashedPassword,
          role: seedUser.role,
          tutorRoles: seedUser.tutorRoles,
          provider: AuthProvider.EMAIL,
          isEmailVerified: true,
          acceptedTerms: true,
        },
      });

      this.logger.log(`Seed ${seedUser.label} created for ${seedUser.email}`);
    }
  }
}
