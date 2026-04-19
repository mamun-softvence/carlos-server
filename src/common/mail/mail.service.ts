import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { ENVEnum } from '@/common/enum/env.enum';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.getOrThrow<string>(ENVEnum.MAIL_HOST),
      port: Number(this.configService.getOrThrow<string>(ENVEnum.MAIL_PORT)),
      secure: false,
      auth: {
        user: this.configService.getOrThrow<string>(ENVEnum.MAIL_USER),
        pass: this.configService.getOrThrow<string>(ENVEnum.MAIL_PASS),
      },
    });
  }

  async sendResetCode(email: string, code: string) {
    const from = this.configService.getOrThrow<string>(ENVEnum.MAIL_FROM);

    await this.transporter.sendMail({
      from,
      to: email,
      subject: 'Password Reset Code',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Password Reset</h2>
          <p>Your password reset verification code is:</p>
          <h1 style="letter-spacing: 6px;">${code}</h1>
          <p>This code will expire in 10 minutes.</p>
        </div>
      `,
    });
  }
}