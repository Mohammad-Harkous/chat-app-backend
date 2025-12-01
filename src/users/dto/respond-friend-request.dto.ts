import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';

export enum FriendRequestAction {
  ACCEPT = 'accept',
  REJECT = 'reject',
  IGNORE = 'ignore',
}

export class RespondFriendRequestDto {
  @ApiProperty({
    description: 'Action to perform on friend request',
    enum: FriendRequestAction,
    example: FriendRequestAction.ACCEPT,
  })
  @IsEnum(FriendRequestAction)
  @IsNotEmpty()
  action: FriendRequestAction;
}