import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class SeatCategoryInputDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsInt()
  price?: number;
}

export class SeatInputDto {
  @IsString()
  @IsNotEmpty()
  seatRow!: string;

  @IsInt()
  seatNumber!: number;

  @IsOptional()
  @IsString()
  categoryName?: string;
}

export class ImportSeatsDto {
  @IsString()
  @IsNotEmpty()
  showtimeId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeatCategoryInputDto)
  categories!: SeatCategoryInputDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeatInputDto)
  seats!: SeatInputDto[];
}