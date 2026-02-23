import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AppService } from './app.service';
import { EarthquakeService } from './earthquake.service';

@WebSocketGateway({
  cors: {
    origin: '*',
    // path: '/socket'
  },
})
export class WebsocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    private readonly appService: AppService,
    private readonly earthquakeService: EarthquakeService,
  ) {}

  @WebSocketServer()
  server: Server;

  afterInit() {
    console.log("Initialized");
  }

  handleConnection(client: any, ...args: any[]) {
    const { sockets } = this.server.sockets;

    console.log(`Client id: ${client.id} connected`);
    console.log(`Number of connected clients: ${sockets.size}`);

    this.earthquakeService.loopGenerateEarthquakes(this.server);
  }

  handleDisconnect(client: any) {
    console.log(`Cliend id:${client.id} disconnected`);
    this.earthquakeService.deleteGenerators();
  }

  @SubscribeMessage('message')
  handleMessage(
    @MessageBody() data: string,
    @ConnectedSocket() client: Socket,
  ): void {
    console.log(`Received message: ${data}`);
    this.server.emit('message', `Server received: ${data}`);
  }
}
