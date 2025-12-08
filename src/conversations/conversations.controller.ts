import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('conversations')
@Controller('conversations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  // Create or get conversation with a friend
  @Post()
  @ApiOperation({ summary: 'Create or get conversation with a friend' })
  @ApiResponse({
    status: 201,
    description: 'Conversation created or retrieved successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'You can only chat with friends',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async createConversation(
    @GetUser() user: User,
    @Body() dto: CreateConversationDto,
  ) {
    return this.conversationsService.createOrGetConversation(
      user.id,
      dto.participantId,
    );
  }

  // Get all user's conversations
  @Get()
  @ApiOperation({ summary: 'Get all conversations for the current user' })
  @ApiResponse({
    status: 200,
    description: 'Conversations retrieved successfully',
  })
  async getUserConversations(@GetUser() user: User) {
    return this.conversationsService.getUserConversations(user.id);
  }

   // Get all unread counts
  @Get('unread')
  @ApiOperation({ summary: 'Get unread message counts for all conversations' })
  @ApiResponse({
    status: 200,
    description: 'Returns unread counts per conversation',
    schema: {
      example: {
        'conv-123': 2,
        'conv-456': 5,
        total: 7,
      },
    },
  })
  async getUnreadCounts(@GetUser() user: User) {
    return this.conversationsService.getUnreadCounts(user.id);
  }


  // Get conversation by ID
  @Get(':id')
  @ApiOperation({ summary: 'Get conversation by ID' })
  @ApiParam({
    name: 'id',
    description: 'Conversation ID',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Conversation retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Conversation not found',
  })
  @ApiResponse({
    status: 400,
    description: 'You are not part of this conversation',
  })
  async getConversation(@GetUser() user: User, @Param('id') id: string) {
    return this.conversationsService.getConversation(id, user.id);
  }

  // Get unread count for specific conversation
  @Get(':id/unread')
  @ApiOperation({ summary: 'Get unread message count for a specific conversation' })
  @ApiParam({
    name: 'id',
    description: 'Conversation ID',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns unread count',
    schema: {
      example: { count: 3 },
    },
  })
  async getConversationUnreadCount(
    @GetUser() user: User,
    @Param('id') conversationId: string,
  ) {
    return this.conversationsService.getConversationUnreadCount(
      user.id,
      conversationId,
    );
  }

  // Get messages for a conversation
  @Get(':id/messages')
  @ApiOperation({ summary: 'Get messages for a conversation' })
  @ApiParam({
    name: 'id',
    description: 'Conversation ID',
    type: 'string',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of messages to retrieve (default: 50)',
  })
  @ApiResponse({
    status: 200,
    description: 'Messages retrieved successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'You are not part of this conversation',
  })
  async getMessages(
    @GetUser() user: User,
    @Param('id') conversationId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.conversationsService.getMessages(conversationId, user.id, limit);
  }

  // Send a message
  @Post('messages')
  @ApiOperation({ summary: 'Send a message in a conversation' })
  @ApiResponse({
    status: 201,
    description: 'Message sent successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid conversation or not a participant',
  })
  @ApiResponse({
    status: 404,
    description: 'Conversation not found',
  })
  async sendMessage(@GetUser() user: User, @Body() dto: SendMessageDto) {
    return this.conversationsService.sendMessage(
      user.id,
      dto.conversationId,
      dto.content,
    );
  }

  // Mark message as read
  @Patch('messages/:id/read')
  @ApiOperation({ summary: 'Mark a message as read' })
  @ApiParam({
    name: 'id',
    description: 'Message ID',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Message marked as read successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Message not found',
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot mark your own message as read or not part of conversation',
  })
  async markMessageAsRead(@GetUser() user: User, @Param('id') messageId: string) {
    return this.conversationsService.markMessageAsRead(messageId, user.id);
  }

  // Mark all messages in conversation as read
  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark all messages in conversation as read' })
  @ApiParam({
    name: 'id',
    description: 'Conversation ID',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'All messages marked as read',
  })
  async markConversationAsRead(
    @GetUser() user: User,
    @Param('id') conversationId: string,
  ) {
    return this.conversationsService.markConversationAsRead(conversationId, user.id);
  }

  // Add this method after the other endpoints
  @Delete(':id')
  @ApiOperation({ summary: 'Delete conversation (soft delete - hide from your list)' })
  @ApiParam({
    name: 'id',
    description: 'Conversation ID',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Conversation deleted successfully',
    schema: {
      example: { message: 'Conversation deleted successfully' },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Conversation not found',
  })
  async deleteConversation(
    @GetUser() user: User,
    @Param('id') conversationId: string,
  ) {
    return this.conversationsService.deleteConversation(conversationId, user.id);
  }
}