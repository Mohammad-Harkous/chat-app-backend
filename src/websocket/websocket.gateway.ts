import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Logger, UnauthorizedException, Inject, forwardRef } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { RedisService } from 'src/redis/redis.service';

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:5173', // Frontend URL
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
     @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly redisService: RedisService,
  ) {
    this.logger.log('🚀 EventsGateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      this.logger.log(`🔌 New connection attempt: ${client.id}`);

      // Extract token from cookie (sent automatically by browser)
      const cookies = client.handshake.headers.cookie;
      this.logger.log(`Authentication cookies present: ${!!cookies}`);

      if (!cookies) {
        throw new UnauthorizedException('No cookies provided');
      }

      // Parse cookie string to get access_token
      const tokenMatch = cookies.match(/access_token=([^;]+)/);
      const token = tokenMatch ? tokenMatch[1] : null;

      if (!token) {
        throw new UnauthorizedException('No access token in cookies');
      }

      // Verify token
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      this.logger.log(`Token verified for user: ${payload.username} (${payload.sub})`);

      // Store user info in socket
      client.data.userId = payload.sub;
      client.data.username = payload.username;

      // Join user to their personal room
      client.join(`user:${payload.sub}`);

      //  Store in Redis
      await this.redisService.addOnlineUser(payload.sub, client.id);

      // Update database: set user online
      await this.usersService.updateOnlineStatus(payload.sub, true);

      this.logger.log(`✅ Client connected: ${client.id} (User: ${payload.username})`);

      // Emit online status to all users
      this.server.emit('userStatusChanged', {
        userId: payload.sub,
        isOnline: true,
      });
    } catch (error) {
      this.logger.error(`❌ Connection failed: ${error.message}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    const username = client.data.username;

    if (userId) {
       // Remove from Redis
      await this.redisService.removeOnlineUser(userId);

      // Update database: set user offline
      await this.usersService.updateOnlineStatus(userId, false);

      // Emit offline status
      this.server.emit('userStatusChanged', {
        userId: userId,
        isOnline: false,
      });

      this.logger.log(`Client disconnected: ${client.id} (User: ${username})`);
    }
  }

  // Typing indicators
  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; recipientId: string },
  ) {
    this.logger.log(`⌨️ User ${client.data.username} is typing in conversation ${data.conversationId}`);

    // Store in Redis with auto-expiration
    await this.redisService.setTyping(data.conversationId, client.data.userId);
    
    // Emit to recipient only
    this.server.to(`user:${data.recipientId}`).emit('userTyping', {
      conversationId: data.conversationId,
      userId: client.data.userId,
      username: client.data.username,
    });
  }

  @SubscribeMessage('stopTyping')
  async handleStopTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; recipientId: string },
  ) {
    this.logger.log(`⌨️ User ${client.data.username} stopped typing`);

    // Remove from Redis
    await this.redisService.removeTyping(data.conversationId, client.data.userId);
    
    // Emit to recipient only
    this.server.to(`user:${data.recipientId}`).emit('userStoppedTyping', {
      conversationId: data.conversationId,
      userId: client.data.userId,
    });
  }


  // Send event to specific user
  emitToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  // Send event to all connected clients
  emitToAll(event: string, data: any) {
    this.server.emit(event, data);
  }

  // Get online users count
  async getConnectedUsersCount(): Promise<number> {
    // Get from Redis
    return await this.redisService.getOnlineUsersCount();
  }

  // Check if user is online
  async isUserOnline(userId: string): Promise<boolean> {
    // Check from Redis
    return await this.redisService.isUserOnline(userId);
  }
}