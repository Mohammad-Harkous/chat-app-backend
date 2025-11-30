import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.userRepository.find();
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async findByEmail(email?: string): Promise<User | null> {
    if (!email) return null;
    return this.userRepository.findOne({ where: { email } });
  }

  async findByUsername(username?: string): Promise<User | null> {
    if (!username) return null;
    return this.userRepository.findOne({ where: { username } });
  }

  async create(userData: Partial<User>): Promise<User> {
    // Check if email already exists
    const existingEmail = await this.findByEmail(userData.email);
    if (existingEmail) {
      throw new ConflictException('Email already exists');
    }

    // Check if username already exists
    const existingUsername = await this.findByUsername(userData.username);
    if (existingUsername) {
      throw new ConflictException('Username already exists');
    }

    const user = this.userRepository.create(userData);
    return this.userRepository.save(user);
  }

  async update(id: string, userData: Partial<User>): Promise<User> {
    const user = await this.findById(id);
    // Only update fields that are provided
    Object.assign(user, userData);
    return this.userRepository.save(user);
  }

  async updateOnlineStatus(id: string, isOnline: boolean): Promise<void> {
    await this.userRepository.update(id, {
      isOnline,
      lastSeen: new Date(),
    });
  }
}