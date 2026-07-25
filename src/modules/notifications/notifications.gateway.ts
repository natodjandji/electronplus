import { Inject, Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import type { Server, Socket } from 'socket.io';
import { FIREBASE_AUTH, FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { Role } from '../../common/enums/role.enum';

function roomFor(role: Role): string {
  return `role:${role}`;
}

@WebSocketGateway({ cors: { origin: '*' }, namespace: 'realtime' })
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    @Inject(FIREBASE_AUTH) private readonly auth: Auth,
    @Inject(FIRESTORE) private readonly firestore: Firestore,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      const decoded = await this.auth.verifyIdToken(token);
      const userSnap = await this.firestore.collection(Collections.USERS).doc(decoded.uid).get();
      const role = userSnap.data()?.role as Role | undefined;
      if (role !== Role.ADMIN && role !== Role.WAREHOUSE_OPERATOR) {
        client.disconnect(true);
        return;
      }
      await client.join(roomFor(role));
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Realtime client disconnected: ${client.id}`);
  }

  broadcastToRoles(roles: Role[], event: string, payload: unknown): void {
    for (const role of roles) {
      this.server.to(roomFor(role)).emit(event, payload);
    }
  }
}
