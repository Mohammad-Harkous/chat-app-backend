import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    this.client = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.client.on('connect', () => {
      this.logger.log('✅ Connected to Redis');
    });

    this.client.on('error', (error) => {
      this.logger.error('❌ Redis connection error:', error);
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
    this.logger.log('🔌 Disconnected from Redis');
  }

  getClient(): Redis {
    return this.client;
  }

  // ===== ONLINE USERS =====

  /**
   * Add user to online users set
   */
  async addOnlineUser(userId: string, socketId: string): Promise<void> {
    await this.client.sadd('online_users', userId);
    await this.client.hset('user_sockets', userId, socketId);
    this.logger.log(`🟢 User ${userId} is now online`);
  }

  /**
   * Remove user from online users set
   */
  async removeOnlineUser(userId: string): Promise<void> {
    await this.client.srem('online_users', userId);
    await this.client.hdel('user_sockets', userId);
    this.logger.log(`⚫ User ${userId} is now offline`);
  }

  /**
   * Check if user is online
   */
  async isUserOnline(userId: string): Promise<boolean> {
    const result = await this.client.sismember('online_users', userId);
    return result === 1;
  }

  /**
   * Get all online users
   */
  async getOnlineUsers(): Promise<string[]> {
    return await this.client.smembers('online_users');
  }

  /**
   * Get online users count
   */
  async getOnlineUsersCount(): Promise<number> {
    return await this.client.scard('online_users');
  }

  /**
   * Get socket ID for user
   */
  async getSocketId(userId: string): Promise<string | null> {
    return await this.client.hget('user_sockets', userId);
  }

  // ===== TYPING INDICATORS =====

  /**
   * Set typing indicator (expires after 5 seconds)
   */
  async setTyping(conversationId: string, userId: string): Promise<void> {
    const key = `typing:${conversationId}:${userId}`;
    await this.client.setex(key, 5, '1');
    this.logger.log(`⌨️ User ${userId} is typing in ${conversationId}`);
  }

  /**
   * Remove typing indicator
   */
  async removeTyping(conversationId: string, userId: string): Promise<void> {
    const key = `typing:${conversationId}:${userId}`;
    await this.client.del(key);
    this.logger.log(`⌨️ User ${userId} stopped typing in ${conversationId}`);
  }

  /**
   * Check if user is typing
   */
  async isTyping(conversationId: string, userId: string): Promise<boolean> {
    const key = `typing:${conversationId}:${userId}`;
    const result = await this.client.exists(key);
    return result === 1;
  }

  /**
   * Get all users typing in a conversation
   */
  async getTypingUsers(conversationId: string): Promise<string[]> {
    const pattern = `typing:${conversationId}:*`;
    const keys = await this.client.keys(pattern);
    
    return keys.map(key => {
      // Extract userId from "typing:conv-123:user-456"
      const parts = key.split(':');
      return parts[parts.length - 1];
    });
  }

  // ===== UNREAD COUNTS =====

  /**
   * Increment unread count for a conversation
   */
  async incrementUnread(userId: string, conversationId: string): Promise<number> {
    const key = `unread:${userId}`;
    const count = await this.client.hincrby(key, conversationId, 1);
    this.logger.log(`📬 User ${userId} has ${count} unread in ${conversationId}`);
    return count;
  }

  /**
   * Reset unread count for a conversation
   */
  async resetUnread(userId: string, conversationId: string): Promise<void> {
    const key = `unread:${userId}`;
    await this.client.hdel(key, conversationId);
    this.logger.log(`✅ Unread count reset for ${userId} in ${conversationId}`);
  }

  /**
   * Get unread count for a conversation
   */
  async getUnreadCount(userId: string, conversationId: string): Promise<number> {
    const key = `unread:${userId}`;
    const count = await this.client.hget(key, conversationId);
    return count ? parseInt(count, 10) : 0;
  }

  /**
   * Get all unread counts for a user
   */
  async getAllUnreadCounts(userId: string): Promise<Record<string, number>> {
    const key = `unread:${userId}`;
    const counts = await this.client.hgetall(key);
    
    // Convert string values to numbers
    const result: Record<string, number> = {};
    for (const [conversationId, count] of Object.entries(counts)) {
      result[conversationId] = parseInt(count, 10);
    }
    
    return result;
  }

  /**
   * Get total unread count for a user (across all conversations)
   */
  async getTotalUnreadCount(userId: string): Promise<number> {
    const counts = await this.getAllUnreadCounts(userId);
    return Object.values(counts).reduce((sum, count) => sum + count, 0);
  }

  // ===== MESSAGE CACHE =====

  /**
   * Cache a message in a conversation (stores last 50 messages)
   */
  async cacheMessage(conversationId: string, message: any): Promise<void> {
    const key = `messages:${conversationId}`;
    const messageJson = JSON.stringify(message);
    
    // Add to left (newest first)
    await this.client.lpush(key, messageJson);
    
    // Keep only last 50 messages
    await this.client.ltrim(key, 0, 49);
    
    this.logger.log(`💾 Cached message in ${conversationId}`);
  }

  
  // Get cached messages for a conversation
  async getCachedMessages(conversationId: string, limit: number = 50): Promise<any[]> {
    const key = `messages:${conversationId}`;
    const messages = await this.client.lrange(key, 0, limit - 1);
    
    return messages.map(msg => JSON.parse(msg)).reverse(); // Reverse to get chronological order
  }

  
  // Invalidate message cache for a conversation
  async invalidateMessageCache(conversationId: string): Promise<void> {
    const key = `messages:${conversationId}`;
    await this.client.del(key);
    this.logger.log(`🗑️ Invalidated message cache for ${conversationId}`);
  }

  // ===== GENERAL CACHE =====

  // Set a cache value with optional TTL
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }


  // Get a cache value
  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  
  // Delete a cache value
  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  // Check if key exists
  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }
}