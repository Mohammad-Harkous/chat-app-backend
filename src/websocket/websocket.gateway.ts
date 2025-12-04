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
  private connectedUsers = new Map<string, string>(); // userId -> socketId

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
     @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {
    this.logger.log('🚀 EventsGateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      this.logger.log(`🔌 New connection attempt: ${client.id}`);

      // Extract token from cookie (sent automatically by browser)
      const cookies = client.handshake.headers.cookie;
      this.logger.log(`Cookies received: ${cookies}`);

      if (!cookies) {
        throw new UnauthorizedException('No cookies provided');
      }

      // Parse cookie string to get access_token
      const tokenMatch = cookies.match(/access_token=([^;]+)/);
      const token = tokenMatch ? tokenMatch[1] : null;

      if (!token) {
        throw new UnauthorizedException('No access token in cookies');
      }

      this.logger.log(`Token extracted: ${token.substring(0, 20)}...`);

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

      // Track connected user
      this.connectedUsers.set(payload.sub, client.id);

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
      // Remove from connected users
      this.connectedUsers.delete(userId);

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

  // Send event to specific user
  emitToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  // Send event to all connected clients
  emitToAll(event: string, data: any) {
    this.server.emit(event, data);
  }

  // Get online users count
  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  // Check if user is online
  isUserOnline(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }
}