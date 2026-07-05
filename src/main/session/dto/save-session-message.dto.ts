import { IsUUID } from 'class-validator';

export class SaveSessionMessageDto {
  @IsUUID()
  messageId!: string;
}
