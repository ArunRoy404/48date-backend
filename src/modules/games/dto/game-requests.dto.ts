import { IsString, IsNotEmpty } from 'class-validator';

export class StartGameDto {
  @IsString()
  @IsNotEmpty()
  matchId: string;

  @IsString()
  @IsNotEmpty()
  gameId: string;
}

export class SubmitAnswerDto {
  @IsString()
  @IsNotEmpty()
  gameSessionId: string;

  @IsString()
  @IsNotEmpty()
  questionId: string;

  @IsString()
  @IsNotEmpty()
  selectedOption: string;
}
