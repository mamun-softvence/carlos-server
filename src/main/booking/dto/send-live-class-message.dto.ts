import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendLiveClassMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;
}
