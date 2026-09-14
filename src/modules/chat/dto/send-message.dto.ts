import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { MessageType } from '../../../generated/prisma/enums.js';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  conversationId: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsEnum(MessageType)
  @IsOptional()
  type?: MessageType;
}
