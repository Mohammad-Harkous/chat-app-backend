import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'johndoe',
    description: 'Username or email',
  })
  @IsString()
  @IsNotEmpty({ message: 'Username or email is required' })
  identifier: string; // Can be username OR email

  @ApiProperty({
    example: 'StrongP@ss123',
    description: 'User password',
  })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password: string;
}