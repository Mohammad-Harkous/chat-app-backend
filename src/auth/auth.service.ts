import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(
    registerDto: RegisterDto,
    res: Response,
  ): Promise<{ user: User }> {
    const { email, username, password, firstName, lastName } = registerDto;

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await this.usersService.create({
      email,
      username,
      password: hashedPassword,
      firstName,
      lastName,
    });

    // Generate access token
    const accessToken = this.generateAccessToken(user);

    // Set cookie
    this.setTokenCookie(res, accessToken);

    return { user };
  }

  async login(loginDto: LoginDto, res: Response): Promise<{ user: User }> {
    const { identifier, password } = loginDto;

    // Find user by email or username
    let user = await this.usersService.findByEmail(identifier);
    if (!user) {
      user = await this.usersService.findByUsername(identifier);
    }

    // Check if user exists
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update online status
    await this.usersService.updateOnlineStatus(user.id, true);

    // Generate access token
    const accessToken = this.generateAccessToken(user);

    // Set cookie
    this.setTokenCookie(res, accessToken);

    return { user };
  }

  async logout(res: Response): Promise<{ message: string }> {
    // Clear cookie
    res.clearCookie('access_token', {
      httpOnly: true,
      secure: this.configService.get('NODE_ENV') === 'production',
      sameSite: 'strict',
    });

    return { message: 'Logged out successfully' };
  }

  async validateUser(userId: string): Promise<User> {
    return this.usersService.findById(userId);
  }

  private generateAccessToken(user: User): string {
    const payload = {
      sub: user.id,
      email: user.email,
      username: user.username,
    };

    return this.jwtService.sign(payload);
  }

  private setTokenCookie(res: Response, token: string): void {
    const maxAge = this.configService.get<number>('COOKIE_MAX_AGE') || 900000; // 15 minutes

    res.cookie('access_token', token, {
      httpOnly: true, // ← Prevents JavaScript access (XSS protection)
      secure: this.configService.get('NODE_ENV') === 'production', // ← HTTPS only in production
      sameSite: 'strict', // ← CSRF protection
      maxAge: maxAge, // ← Cookie expiration (15 minutes)
      path: '/', // ← Cookie available on all routes
    });
  }
}