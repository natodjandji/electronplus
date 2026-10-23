import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
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
  @IsOptional()
  @IsBoolean()
  paused?: boolean;

  /** Stops (or restarts) the order and quote updates to this customer. */
  @IsOptional()
  @IsBoolean()
  noticesOff?: boolean;
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

  /** Country code and number, digits only. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @Matches(/^[1-9]\d{9,14}$/, { each: true })
  alertPhones?: string[];

  @IsOptional()
  @IsBoolean()
  customerUpdatesEnabled?: boolean;

  /** US dollars a day, all chats together. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(500)
  dailyBudgetUsd?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  chatRepliesPerHour?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  chatRepliesPerDay?: number;
}
