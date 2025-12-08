import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateConversationDto {
  @ApiProperty({
    description: 'The ID of the friend you want to start a conversation with',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  participantId: string;  // The friend you want to chat with
}