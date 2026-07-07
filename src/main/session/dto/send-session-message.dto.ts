import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendSessionMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;
}
