import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { FriendsController } from './friends.controller';
import { UsersService } from './users.service';
import { FriendsService } from './friends.service';
import { User } from './entities/user.entity';
import { FriendRequest } from './entities/friend-request.entity';
import { Friendship } from './entities/friendship.entity';

@Module({
  imports: [TypeOrmModule.forFeature([
    User,
    FriendRequest,
    Friendship,     
  ])],
  controllers: [
    UsersController, 
    FriendsController,
  ],
  providers: [
    UsersService,
    FriendsService,
  ],
  exports: [UsersService, FriendsService], // Important! Makes UsersService and FriendsService available to other modules
})
export class UsersModule {}