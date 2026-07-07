import { IsArray, IsUUID, ArrayMinSize } from 'class-validator';

export class StudentBookBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  bookingIds!: string[];
}
