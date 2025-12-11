import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository,IsNull } from 'typeorm';
import { Response } from 'express';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from '../users/entities/refresh-token.entity';


@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private  readonly configService: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
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

    // Generate tokens
    const accessToken = this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user);

    // Set cookies
    this.setTokenCookies(res, accessToken, refreshToken);

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

    // Generate tokens
    const accessToken = this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user);

    // Set cookies
    this.setTokenCookies(res, accessToken, refreshToken);

    return { user };
  }

async refresh(refreshTokenString: string, res: Response): Promise<{ message: string }> {
  try {
    // Verify refresh token JWT signature
    const payload = this.jwtService.verify(refreshTokenString, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
    });

    // Find ALL non-revoked tokens for this user
    const storedTokens = await this.refreshTokenRepository.find({
      where: {
        user: { id: payload.sub },
        revokedAt: IsNull(),
      },
      relations: ['user'],
    });

    if (!storedTokens || storedTokens.length === 0) {
      throw new UnauthorizedException('No valid refresh token found');
    }

    // Compare the provided token against stored hashes
    let validToken: RefreshToken | null = null;
    for (const storedToken of storedTokens) {
      const isMatch = await bcrypt.compare(refreshTokenString, storedToken.tokenHash);
      if (isMatch) {
        // Check if token is expired
        if (new Date() > storedToken.expiresAt) {
          throw new UnauthorizedException('Refresh token expired');
        }
        validToken = storedToken;
        break;
      }
    }

    if (!validToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Get user
    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Generate new access token
    const newAccessToken = this.generateAccessToken(user);

    // Set new access token cookie (keep refresh token)
    this.setAccessTokenCookie(res, newAccessToken);

    return { message: 'Token refreshed successfully' };
  } catch (error) {
    throw new UnauthorizedException('Invalid refresh token');
  }
}
 async getMe(userId: string) {
  // Fetch fresh user data from database
  const user = await this.usersService.findById(userId);
  
  console.log(`👤 /auth/me: User ${userId.substring(0, 8)}, isOnline: ${user.isOnline}`);
  
  return { user };
  }

  async logout(userId: string, res: Response): Promise<{ message: string }> {
  try {
    // Revoke all refresh tokens for this user
    await this.refreshTokenRepository.update(
      { user: { id: userId }, revokedAt: IsNull() }, // Only update non-revoked tokens
      { revokedAt: new Date() },
    );

    // Clear cookies
    this.clearTokenCookies(res);

    return { message: 'Logged out successfully' };
  } catch (error) {
    // Even if database fails, clear cookies
    this.clearTokenCookies(res);
    return { message: 'Logged out successfully' };
  }
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

  const secret = this.configService.get<string>('JWT_SECRET');
  const expiresIn = (this.configService.get<string>('JWT_EXPIRATION') || '15m');

  if (!secret) {
    throw new Error('JWT_SECRET is not defined');
  }

  const options: any = {
    secret: secret,
    expiresIn: expiresIn,
  };

  return this.jwtService.sign(payload, options);
}

private async generateRefreshToken(user: User): Promise<string> {
  const payload = {
    sub: user.id,
    type: 'refresh',
  };

  const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
  const expiresIn = (this.configService.get<string>('JWT_REFRESH_EXPIRATION') || '7d');

  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET is not defined');
  }

  const options: any = {
    secret: secret,
    expiresIn: expiresIn,
  };

  const refreshToken = this.jwtService.sign(payload, options);

  // Hash token before storing in database
  const tokenHash = await bcrypt.hash(refreshToken, 10);

  // Calculate expiration date (7 days from now)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  // Store in database
  await this.refreshTokenRepository.save({
    user: { id: user.id },
    tokenHash,
    expiresAt,
  });

  return refreshToken;
}

  private setTokenCookies(res: Response, accessToken: string, refreshToken: string): void {
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    const accessTokenMaxAge = this.configService.get<number>('COOKIE_MAX_AGE') || 900000; // 15 min
    const refreshTokenMaxAge = this.configService.get<number>('REFRESH_COOKIE_MAX_AGE') || 604800000; // 7 days

    // Set access token cookie
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: accessTokenMaxAge,
      path: '/',
    });

    // Set refresh token cookie
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: refreshTokenMaxAge,
      path: '/',
    });
  }

  private setAccessTokenCookie(res: Response, accessToken: string): void {
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    const accessTokenMaxAge = this.configService.get<number>('COOKIE_MAX_AGE') || 900000;

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: accessTokenMaxAge,
      path: '/',
    });
  }

  private clearTokenCookies(res: Response): void {
    const isProduction = this.configService.get('NODE_ENV') === 'production';

    res.clearCookie('access_token', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/',
    });

    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/',
    });
  }
}