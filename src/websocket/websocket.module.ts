import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { EventsGateway } from './websocket.gateway';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [JwtModule, ConfigModule, forwardRef(() => UsersModule)],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class WebSocketModule {}