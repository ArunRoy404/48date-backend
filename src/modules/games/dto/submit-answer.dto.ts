import { IsUUID, IsNotEmpty, IsString } from 'class-validator';

export class SubmitAnswerDto {
  @IsUUID()
  @IsNotEmpty()
  questionId: string;

  @IsString()
  @IsNotEmpty()
  selectedOption: string;
}
