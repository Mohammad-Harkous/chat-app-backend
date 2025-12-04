import { Module, forwardRef} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { FriendsController } from './friends.controller';
import { UsersService } from './users.service';
import { FriendsService } from './friends.service';
import { User } from './entities/user.entity';
import { FriendRequest } from './entities/friend-request.entity';
import { Friendship } from './entities/friendship.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      FriendRequest,
      Friendship,
      RefreshToken,    
    ]),
   forwardRef(() => WebSocketModule), 
  ],
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