import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  CHAT_EFFORTS,
  CHAT_MODELS,
  type ChatEffort,
  type ChatModel,
} from '../entities/chat.entity';

/** What a Cloud Tasks reply task carries (see ReplyQueueService). */
export class ReplyJobDto {
  @IsString()
  @MaxLength(200)
  conversationId: string;

  @IsString()
  @MaxLength(500)
  triggerId: string;
}

export class UpdateConversationDto {
  @IsBoolean()
  paused: boolean;
}

export class UpdateMessagingSettingsDto {
  @IsOptional()
  @IsBoolean()
  botEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  whatsappEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  instagramEnabled?: boolean;

  @IsOptional()
  @IsIn(CHAT_MODELS)
  model?: ChatModel;

  @IsOptional()
  @IsIn(CHAT_EFFORTS)
  effort?: ChatEffort;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  humanPauseHours?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  extraInstructions?: string;
}
