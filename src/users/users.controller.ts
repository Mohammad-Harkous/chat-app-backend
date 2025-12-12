import {
  Controller,
  Get,
  Param,
  UseGuards,
  ClassSerializerInterceptor,
  UseInterceptors,
  Delete,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { FriendsService } from './friends.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiTags('users')
@UseInterceptors(ClassSerializerInterceptor) // Important! Applies @Exclude() decorator
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly friendsService: FriendsService
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({ status: 200, description: 'Returns all users' })
  async findAll(): Promise<User[]> {
    return this.usersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, description: 'Returns user' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(@Param('id') id: string): Promise<User> {
    return this.usersService.findById(id);
  }

  // Remove a friend (unfriend)
  @Delete('friends/:friendId')
    @ApiOperation({ summary: 'Remove a friend (unfriend)' })
    @ApiParam({
      name: 'friendId',
      description: 'ID of the friend to remove',
      type: 'string',
    })
    @ApiResponse({
      status: 200,
      description: 'Friend removed successfully',
    })
    async removeFriend(
      @GetUser() user: User,  // ← Make sure @GetUser() is here
      @Param('friendId') friendId: string,
    ) {
      
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      await this.friendsService.removeFriend(user.id, friendId);
      return { message: 'Friend removed successfully' };
    }
}