import { IsIn, IsOptional, IsString } from 'class-validator';

export class BookingQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['PENDING', 'SCHEDULED', 'COMPLETED', 'CANCELLED'])
  status?: 'PENDING' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
}
