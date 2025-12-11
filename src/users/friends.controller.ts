import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
  Query,
  HttpCode,
  HttpStatus,
  Delete,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { Request } from 'express';
import { FriendsService } from './friends.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { RespondFriendRequestDto } from './dto/respond-friend-request.dto';
import { FriendRequest } from './entities/friend-request.entity';
import { User } from './entities/user.entity';

@ApiTags('friends')
@Controller('friends')
@UseGuards(JwtAuthGuard)
@ApiCookieAuth()
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Post('requests')
  @ApiOperation({ summary: 'Send a friend request' })
  @ApiResponse({ status: 201, description: 'Friend request sent successfully' })
  @ApiResponse({ status: 400, description: 'Bad request (already friends, request exists, etc.)' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async sendFriendRequest(
    @Req() req: Request,
    @Body() dto: SendFriendRequestDto,
  ): Promise<{ message: string; request: FriendRequest }> {
    const currentUser = req.user as User;
    const request = await this.friendsService.sendFriendRequest(
      currentUser.id,
      dto.receiverId,
    );
    return {
      message: 'Friend request sent successfully',
      request,
    };
  }

  @Get('requests/pending')
  @ApiOperation({ summary: 'Get pending friend requests received' })
  @ApiResponse({ status: 200, description: 'Returns pending friend requests' })
  async getPendingRequests(@Req() req: Request): Promise<FriendRequest[]> {
    const currentUser = req.user as User;
    return this.friendsService.getPendingRequests(currentUser.id);
  }

  @Get('requests/sent')
  @ApiOperation({ summary: 'Get friend requests sent by current user' })
  @ApiResponse({ status: 200, description: 'Returns sent friend requests' })
  async getSentRequests(@Req() req: Request): Promise<FriendRequest[]> {
    const currentUser = req.user as User;
    return this.friendsService.getSentRequests(currentUser.id);
  }

  @Patch('requests/:requestId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Respond to a friend request (accept/reject/ignore)' })
  @ApiResponse({ status: 200, description: 'Friend request updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Friend request not found' })
  async respondToFriendRequest(
    @Req() req: Request,
    @Param('requestId') requestId: string,
    @Body() dto: RespondFriendRequestDto,
  ): Promise<{ message: string; request: FriendRequest }> {
    const currentUser = req.user as User;
    const request = await this.friendsService.respondToFriendRequest(
      requestId,
      currentUser.id,
      dto.action,
    );
    
    let message = '';
    if (dto.action === 'accept') {
      message = 'Friend request accepted';
    } else if (dto.action === 'ignore') {
      message = 'Friend request ignored';
    } 
    
    return { message, request };
  }

  @Get()
  @ApiOperation({ summary: 'Get all friends of current user' })
  @ApiResponse({ status: 200, description: 'Returns list of friends' })
  async getFriends(@Req() req: Request): Promise<User[]> {
    const currentUser = req.user as User;
    return this.friendsService.getFriends(currentUser.id);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search users by username or email' })
  @ApiQuery({ name: 'q', description: 'Search query', required: true })
  @ApiResponse({ status: 200, description: 'Returns list of users matching query' })
  async searchUsers(
    @Req() req: Request,
    @Query('q') query: string,
  ): Promise<User[]> {
    const currentUser = req.user as User;
    
    if (!query || query.trim().length === 0) {
      return [];
    }
    
    return this.friendsService.searchUsers(currentUser.id, query);
  }

  @Get('check/:userId')
  @ApiOperation({ summary: 'Check if current user is friends with another user' })
  @ApiResponse({ status: 200, description: 'Returns friendship status' })
  async checkFriendship(
    @Req() req: Request,
    @Param('userId') userId: string,
  ): Promise<{ areFriends: boolean }> {
    const currentUser = req.user as User;
    const areFriends = await this.friendsService.areFriends(currentUser.id, userId);
    return { areFriends };
  }
}