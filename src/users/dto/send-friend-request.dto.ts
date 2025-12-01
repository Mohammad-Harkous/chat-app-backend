import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty } from 'class-validator';

export class SendFriendRequestDto {
  @ApiProperty({
    description: 'ID of the user to send friend request to',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  receiverId: string;
}