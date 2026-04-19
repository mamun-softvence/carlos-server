import { IsOptional, IsString } from 'class-validator';

export class UpdateBookingStatusDto {
  @IsOptional()
  @IsString()
  cancelReason?: string;
}
