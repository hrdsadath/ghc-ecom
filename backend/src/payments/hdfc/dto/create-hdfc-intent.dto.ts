import { IsUUID } from 'class-validator';

export class CreateHdfcIntentDto {
  @IsUUID()
  quoteId!: string;
}
