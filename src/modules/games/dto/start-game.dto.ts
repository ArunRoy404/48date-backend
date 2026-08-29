import { IsUUID, IsNotEmpty } from 'class-validator';

export class StartGameSessionDto {
  @IsUUID()
  @IsNotEmpty()
  matchId: string;

  @IsUUID()
  @IsNotEmpty()
  gameId: string;
}
