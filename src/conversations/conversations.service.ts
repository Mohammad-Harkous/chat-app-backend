import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { UsersService } from '../users/users.service';
import { FriendsService } from '../users/friends.service';
import { EventsGateway } from '../websocket/websocket.gateway';
import { RedisService } from 'src/redis/redis.service';

@Injectable()
export class ConversationsService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    private readonly usersService: UsersService,
    private readonly friendsService: FriendsService,
    @Inject(forwardRef(() => EventsGateway))
    private readonly wsGateway: EventsGateway,
    private readonly redisService: RedisService,
  ) {}

  // Start chat with friend
  // Create or get existing conversation with a friend
  async createOrGetConversation(
    userId: string,
    participantId: string,
  ): Promise<Conversation> {
    // Check if users are friends
    const areFriends = await this.friendsService.areFriends(userId, participantId);
    if (!areFriends) {
      throw new BadRequestException('You can only chat with friends');
    }

    // Check if conversation already exists (either direction)
    const existingConversation = await this.conversationRepository.findOne({
      where: [
        { participant1: { id: userId }, participant2: { id: participantId } },
        { participant1: { id: participantId }, participant2: { id: userId } },
      ],
      relations: ['participant1', 'participant2'],
    });

    // if (existingConversation) {
    //   return existingConversation;
    // }

    if (existingConversation) {
    // 🆕 If conversation was deleted by this user, restore it
    const deletedBy = existingConversation.deletedBy || [];
    if (deletedBy.includes(userId)) {
      console.log(`♻️ Restoring conversation for user ${userId.substring(0, 8)}`);
      
      const updatedDeletedBy = deletedBy.filter(id => id !== userId);
      await this.conversationRepository.update(existingConversation.id, {
        deletedBy: updatedDeletedBy,
      });
      
      // Reload conversation with updated data
      const restoredConversation = await this.conversationRepository.findOne({
        where: { id: existingConversation.id },
        relations: ['participant1', 'participant2'],
      });
      
      return restoredConversation || existingConversation;
    }
    
    return existingConversation;
  }

    // Create new conversation
    const conversation = this.conversationRepository.create({
      participant1: { id: userId },
      participant2: { id: participantId },
    });

    return this.conversationRepository.save(conversation);
  }

  // List all my chats
  // Get all conversations for a user
  async getUserConversations(userId: string): Promise<Conversation[]> {
    const conversations = await this.conversationRepository.find({
      where: [
        { participant1: { id: userId } },
        { participant2: { id: userId } },
      ],
      relations: ['participant1', 'participant2'],
      order: { lastMessageAt: 'DESC' },
    });

    // Filter out conversations deleted by this user
    const activeConversations = conversations.filter(conv => {
      const deletedBy = conv.deletedBy || [];
      return !deletedBy.includes(userId);
    });

    console.log(`📊 User has ${conversations.length} total, ${activeConversations.length} active conversations`);

    return activeConversations;
  }

  // Get one chat details
  // Get conversation by ID
  async getConversation(conversationId: string, userId: string): Promise<Conversation> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
      relations: ['participant1', 'participant2'],
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Verify user is part of this conversation
    if (
      conversation.participant1.id !== userId &&
      conversation.participant2.id !== userId
    ) {
      throw new BadRequestException('You are not part of this conversation');
    }

    return conversation;
  }

  // Send a message + emit WebSocket event
  async sendMessage(
    userId: string,
    conversationId: string,
    content: string,
  ): Promise<Message> {
    // Verify conversation exists and user is participant
    const conversation = await this.getConversation(conversationId, userId);

     // Restore conversation for recipient if they deleted it
    const recipientId =
      conversation.participant1.id === userId
        ? conversation.participant2.id
        : conversation.participant1.id;
    
    await this.restoreConversation(conversationId, recipientId);

    // Create message
    const message = this.messageRepository.create({
      conversation: { id: conversationId },
      sender: { id: userId },
      content,
      isRead: false,
    });

    const savedMessage = await this.messageRepository.save(message);

    // Update conversation's lastMessageAt
    await this.conversationRepository.update(conversationId, {
      lastMessageAt: new Date(),
    });

    // Load full message with relations
    const fullMessage = await this.messageRepository.findOne({
      where: { id: savedMessage.id },
      relations: ['sender', 'conversation'],
    });

    if (!fullMessage) {
      throw new NotFoundException('Failed to load message');
    }

     // Cache message in Redis
    await this.redisService.cacheMessage(conversationId, fullMessage);

    // Increment unread count for recipient
    await this.redisService.incrementUnread(recipientId, conversationId);

    this.wsGateway.emitToUser(recipientId, 'messageReceived', {
      message: fullMessage,
    });

    return fullMessage;
  }

  // Get chat history
  // Get messages for a conversation
  async getMessages(
    conversationId: string,
    userId: string,
    limit: number = 50,
  ): Promise<Message[]> {
    // Verify user is part of conversation
    await this.getConversation(conversationId, userId);

    // Try to get from Redis cache first
    const cachedMessages = await this.redisService.getCachedMessages(conversationId, limit);
    
    if (cachedMessages.length > 0) {
      console.log(`💾 Returning ${cachedMessages.length} cached messages`);
      return cachedMessages;
    }
    

    // Cache miss - get from database
    console.log(`🗄️ Cache miss - fetching from database`);
    const messages = await this.messageRepository.find({
      where: { conversation: { id: conversationId } },
      relations: ['sender'],
      order: { createdAt: 'ASC' },
      take: limit,
    });

    // Cache for next time
    for (const message of messages) {
      await this.redisService.cacheMessage(conversationId, message);
    }

    return messages;
  }

  // Mark message as read
  async markMessageAsRead(messageId: string, userId: string): Promise<Message> {
    const message = await this.messageRepository.findOne({
      where: { id: messageId },
      relations: ['conversation', 'conversation.participant1', 'conversation.participant2', 'sender'],
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Verify user is the recipient (not the sender)
    if (message.sender.id === userId) {
      throw new BadRequestException('Cannot mark your own message as read');
    }

    // Verify user is part of the conversation
    if (
      message.conversation.participant1.id !== userId &&
      message.conversation.participant2.id !== userId
    ) {
      throw new BadRequestException('You are not part of this conversation');
    }

    message.isRead = true;
    const updatedMessage = await this.messageRepository.save(message);

    // Reset unread count in Redis (user read the messages)
    await this.redisService.resetUnread(userId, message.conversation.id);

    // Emit WebSocket event to sender
    this.wsGateway.emitToUser(message.sender.id, 'messageRead', {
      messageId: message.id,
    });

    return updatedMessage;
  }

  // Mark all messages in a conversation as read
  async markConversationAsRead(
    conversationId: string,
    userId: string,
  ): Promise<{ marked: number }> {
    console.log(`📖 [markConversationAsRead] User ${userId} opening conversation ${conversationId}`);
    
    const conversation = await this.getConversation(conversationId, userId);
    
    const senderId = conversation.participant1.id === userId 
      ? conversation.participant2.id 
      : conversation.participant1.id;
    
    console.log(`📖 Current user: ${userId}`);
    console.log(`📖 Other user (sender): ${senderId}`);
    
    const unreadMessages = await this.messageRepository.find({
      where: {
        conversation: { id: conversationId },
        sender: { id: senderId },
        isRead: false,
      },
      relations: ['sender'],
    });

    console.log(`📖 Found ${unreadMessages.length} unread messages from other user`);

    if (unreadMessages.length > 0) {
      const messageIds = unreadMessages.map(m => m.id);
      await this.messageRepository.update(
        messageIds,
        { isRead: true },
      );

      console.log(`📖 Updated ${messageIds.length} messages in database`);

      // IMPORTANT: Emit messageRead for EACH message
      unreadMessages.forEach((message) => {
        console.log(`✓✓ Emitting messageRead for message ${message.id.substring(0, 8)} to user ${senderId.substring(0, 8)}`);
        this.wsGateway.emitToUser(senderId, 'messageRead', {
          messageId: message.id,
        });
      });
    }

    await this.redisService.resetUnread(userId, conversationId);
    console.log(`📖 Reset unread count in Redis`);

    this.wsGateway.emitToUser(senderId, 'messagesRead', {
      conversationId,
    });

    return { marked: unreadMessages.length };
  }

  // Get unread counts for all conversations
  async getUnreadCounts(userId: string): Promise<{
    [conversationId: string]: number;
    total: number;
  }> {
    // Get all unread counts from Redis
    const counts = await this.redisService.getAllUnreadCounts(userId);
    
    // Calculate total
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    
    return {
      ...counts,
      total,
    };
  }
 
  // Get unread count for a specific conversation
  async getConversationUnreadCount(
    userId: string,
    conversationId: string,
  ): Promise<{ count: number }> {
    // Verify user is part of conversation
    await this.getConversation(conversationId, userId);
    
    // Get unread count from Redis
    const count = await this.redisService.getUnreadCount(userId, conversationId);
    
    return { count };
  }

  
  // Soft delete conversation (hide from user's list)
  async deleteConversation(
    conversationId: string,
    userId: string,
  ): Promise<{ message: string }> {
    console.log(`🗑️ User ${userId.substring(0, 8)} deleting conversation ${conversationId.substring(0, 8)}`);
    
    // Verify user is part of conversation
    const conversation = await this.getConversation(conversationId, userId);
    
    // Get current deletedBy array
    const deletedBy = conversation.deletedBy || [];
    
    // Check if already deleted by this user
    if (deletedBy.includes(userId)) {
      console.log(`⚠️ Conversation already deleted by this user`);
      return { message: 'Conversation already deleted' };
    }
    
    // Add user to deletedBy array
    deletedBy.push(userId);
    
    console.log(`🗑️ Adding user to deletedBy array. Total: ${deletedBy.length}`);
    
    await this.conversationRepository.update(conversationId, {
      deletedBy: deletedBy,
    });
    
    // Clear unread count in Redis
    await this.redisService.resetUnread(userId, conversationId);
    console.log(`🗑️ Cleared unread count for user`);
    
    // If both users deleted it, we could optionally clean up Redis cache
    if (deletedBy.length === 2) {
      console.log(`🗑️ Both users deleted - invalidating cache`);
      await this.redisService.invalidateMessageCache(conversationId);
    }
    
    console.log(`✅ Conversation deleted successfully`);
    return { message: 'Conversation deleted successfully' };
  }

  // Restore deleted conversation (if new message arrives)
  async restoreConversation(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });
    
    if (!conversation || !conversation.deletedBy) {
      return; // Nothing to restore
    }
    
    // Remove user from deletedBy array
    const deletedBy = conversation.deletedBy.filter(id => id !== userId);
    
    await this.conversationRepository.update(conversationId, {
      deletedBy: deletedBy,
    });
    
    console.log(`♻️ Restored conversation for user ${userId.substring(0, 8)}`);
  }
}