import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateSessionSharedPdfDto {
  @ApiProperty({
    example: 'Session Notes',
  })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty({
    type: [String],
    example: [
      '9eec0e6f-3d6f-4a52-94a8-55f0d21bceb0',
      '590b0b84-1d8f-427d-a4f7-26e917a48f56',
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  messageIds!: string[];
}
