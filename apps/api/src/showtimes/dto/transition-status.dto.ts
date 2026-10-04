import { IsEnum, IsNotEmpty } from 'class-validator';
import { ShowtimeStatus } from '@prisma/client';

export class TransitionStatusDto {
  @IsNotEmpty({ message: 'Trạng thái không được để trống' })
  @IsEnum(ShowtimeStatus, {
    message: 'Trạng thái phải là một trong các giá trị: DRAFT, ON_SALE, CLOSED',
  })
  status!: ShowtimeStatus;
}
