import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FriendRequest, FriendRequestStatus } from './entities/friend-request.entity';
import { Friendship } from './entities/friendship.entity';
import { User } from './entities/user.entity';
import { EventsGateway } from '../websocket/websocket.gateway';

@Injectable()
export class FriendsService {
  constructor(
    @InjectRepository(FriendRequest)
    private readonly friendRequestRepository: Repository<FriendRequest>,
    @InjectRepository(Friendship)
    private readonly friendshipRepository: Repository<Friendship>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject(forwardRef(() => EventsGateway)) 
    private readonly wsGateway: EventsGateway,
  ) {}

  // Send friend request
  async sendFriendRequest(senderId: string, receiverId: string): Promise<FriendRequest> {
    // Prevent sending request to yourself
    if (senderId === receiverId) {
      throw new BadRequestException('You cannot send a friend request to yourself');
    }

    // Check if receiver exists
    const receiver = await this.userRepository.findOne({ where: { id: receiverId } });
    if (!receiver) {
      throw new NotFoundException('User not found');
    }

    // Check if already friends
    const existingFriendship = await this.areFriends(senderId, receiverId);
    if (existingFriendship) {
      throw new BadRequestException('You are already friends with this user');
    }

    // Check if request already exists (in either direction)
    const existingRequest = await this.friendRequestRepository.findOne({
      where: [
        { sender: { id: senderId }, receiver: { id: receiverId } },
        { sender: { id: receiverId }, receiver: { id: senderId } },
      ],
    });

    if (existingRequest) {
      if (existingRequest.status === FriendRequestStatus.PENDING) {
        throw new BadRequestException('Friend request already exists');
      }
      // If request was ignored, allow creating a new one
      await this.friendRequestRepository.remove(existingRequest);
    }

    // Create new friend request
    const friendRequest = this.friendRequestRepository.create({
      sender: { id: senderId },
      receiver: { id: receiverId },
      status: FriendRequestStatus.PENDING,
    });

     const savedRequest = await this.friendRequestRepository.save(friendRequest);

    // Load the full request with relations before emitting
    const fullRequest = await this.friendRequestRepository.findOne({
      where: { id: savedRequest.id },
      relations: ['sender', 'receiver'], // Load sender and receiver objects
    });

    if (!fullRequest) {
      throw new NotFoundException('Failed to load friend request');
    }

    // Emit WebSocket event with full data
    this.wsGateway.emitToUser(receiverId, 'friendRequestReceived', {
      request: fullRequest,
    });

    return fullRequest;

  }

  // Get pending friend requests (received by user)
  async getPendingRequests(userId: string): Promise<FriendRequest[]> {
    return this.friendRequestRepository.find({
      where: {
        receiver: { id: userId },
        status: FriendRequestStatus.PENDING,
      },
      order: { createdAt: 'DESC' },
    });
  }

  // Get sent friend requests (sent by user)
  async getSentRequests(userId: string): Promise<FriendRequest[]> {
    return this.friendRequestRepository.find({
      where: {
        sender: { id: userId },
        status: FriendRequestStatus.PENDING,
      },
      order: { createdAt: 'DESC' },
    });
  }

  // Respond to friend request (accept/reject/ignore)
  async respondToFriendRequest(
    requestId: string,
    userId: string,
    action: 'accept' | 'ignore',
  ): Promise<FriendRequest> {
    // Find the request
    const request = await this.friendRequestRepository.findOne({
      where: { id: requestId },
       relations: ['sender', 'receiver'],
    });

    if (!request) {
      throw new NotFoundException('Friend request not found');
    }

    // Verify user is the receiver
    if (request.receiver.id !== userId) {
      throw new BadRequestException('You can only respond to requests sent to you');
    }

    // Update status based on action
    if (action === 'accept') {
      request.status = FriendRequestStatus.ACCEPTED;
      await this.friendRequestRepository.save(request);

      // Create friendship (using the "lower ID first" rule)
      await this.createFriendship(request.sender.id, request.receiver.id);

      // Emit WebSocket event to sender
      this.wsGateway.emitToUser(request.sender.id, 'friendRequestAccepted', {
        request: request,
        user: request.receiver,
      });
    } else if (action === 'ignore') {
      request.status = FriendRequestStatus.IGNORED;
      await this.friendRequestRepository.save(request);
    }

    // update sender's UI (no toast notification)
    this.wsGateway.emitToUser(request.sender.id, 'friendRequestIgnored', {
      requestId: request.id,
    });

    return request;
  }

  // Create friendship 
  private async createFriendship(user1Id: string, user2Id: string): Promise<Friendship> {
    // Sort IDs to ensure user_id_1 < user_id_2
    const [smallerId, largerId] = [user1Id, user2Id].sort();

    const friendship = this.friendshipRepository.create({
      user1: { id: smallerId },
      user2: { id: largerId },
    });

    return this.friendshipRepository.save(friendship);
  }

  // Check if two users are friends
  async areFriends(user1Id: string, user2Id: string): Promise<boolean> {
    const [smallerId, largerId] = [user1Id, user2Id].sort();

    const friendship = await this.friendshipRepository.findOne({
      where: {
        user1: { id: smallerId },
        user2: { id: largerId },
      },
    });

    return !!friendship;
  }

  // Get all friends of a user (COMPLEX QUERY - explained below)
  async getFriends(userId: string): Promise<User[]> {
    const friendships = await this.friendshipRepository.find({
      where: [
        { user1: { id: userId } },
        { user2: { id: userId } },
      ],
    });

    // Extract the "other" user from each friendship
    const friends = friendships.map((friendship) => {
      return friendship.user1.id === userId ? friendship.user2 : friendship.user1;
    });

    return friends;
  }

  // Search users (not friends yet)
  async searchUsers(currentUserId: string, query: string): Promise<User[]> {
    // Find users matching query
    const users = await this.userRepository
      .createQueryBuilder('user')
      .where('user.id != :currentUserId', { currentUserId })
      .andWhere('(user.username ILIKE :query OR user.email ILIKE :query)', {
        query: `%${query}%`,
      })
      .take(20) // Limit to 20 results
      .getMany();

    return users;
  }
}