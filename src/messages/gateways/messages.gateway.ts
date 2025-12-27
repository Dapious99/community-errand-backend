import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { MessagesService } from '../messages.service';
import { CreateMessageDto } from '../dto/create-message.dto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/messages',
})
export class MessagesGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private connectedClients: Map<string, Set<string>> = new Map(); // errandId -> Set of socketIds

  constructor(
    private messagesService: MessagesService,
    private jwtService: JwtService,
    private configService: ConfigService
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.split(' ')[1];
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      client.data.userId = payload.sub;
      console.log(`Client connected: ${client.id}, userId: ${payload.sub}`);
    } catch (error) {
      console.error('Authentication failed:', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    // Clean up from connectedClients map
    this.connectedClients.forEach((clients, errandId) => {
      clients.delete(client.id);
      if (clients.size === 0) {
        this.connectedClients.delete(errandId);
      }
    });
  }

  @SubscribeMessage('join_errand')
  async handleJoinErrand(
    @MessageBody() data: { errandId: string },
    @ConnectedSocket() client: Socket
  ) {
    const { errandId } = data;
    client.join(`errand:${errandId}`);

    if (!this.connectedClients.has(errandId)) {
      this.connectedClients.set(errandId, new Set());
    }
    this.connectedClients.get(errandId)?.add(client.id);

    client.emit('joined_errand', { errandId });
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @MessageBody() data: CreateMessageDto & { errandId: string },
    @ConnectedSocket() client: Socket
  ) {
    const { errandId, ...messageDto } = data;
    const userId = client.data.userId;

    try {
      const message = await this.messagesService.create(
        errandId,
        messageDto,
        userId
      );

      // Broadcast to all clients in the errand room
      client.to(`errand:${errandId}`).emit('new_message', message);
      client.emit('message_sent', message);

      return { success: true, message };
    } catch (error) {
      client.emit('error', { message: error.message });
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @MessageBody() data: { errandId: string; isTyping: boolean },
    @ConnectedSocket() client: Socket
  ) {
    const { errandId, isTyping } = data;
    client.to(`errand:${errandId}`).emit('user_typing', {
      userId: client.data.userId,
      isTyping,
    });
  }
}

