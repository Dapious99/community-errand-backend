import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): { message: string; timestamp: string } {
    return {
      message: 'Community Errand API is running!',
      timestamp: new Date().toISOString(),
    };
  }
}

