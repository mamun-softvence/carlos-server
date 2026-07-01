import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class UpdateStudentMarkDto {
  @ApiProperty({ example: 4, minimum: 0 })
  @IsInt()
  @Min(0)
  input!: number;

  @ApiProperty({ example: 4, minimum: 0 })
  @IsInt()
  @Min(0)
  output!: number;

  @ApiProperty({ example: 4, minimum: 0 })
  @IsInt()
  @Min(0)
  architecture!: number;

  @ApiProperty({ example: 4, minimum: 0 })
  @IsInt()
  @Min(0)
  lexicon!: number;

  @ApiProperty({ example: 4, minimum: 0 })
  @IsInt()
  @Min(0)
  dynamics!: number;
}
