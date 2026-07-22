"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var NotificationsGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsGateway = void 0;
const common_1 = require("@nestjs/common");
const websockets_1 = require("@nestjs/websockets");
const firebase_constants_1 = require("../../firebase/firebase.constants");
const firestore_collections_1 = require("../../firebase/firestore-collections");
const role_enum_1 = require("../../common/enums/role.enum");
function roomFor(role) {
    return `role:${role}`;
}
let NotificationsGateway = NotificationsGateway_1 = class NotificationsGateway {
    constructor(auth, firestore) {
        this.auth = auth;
        this.firestore = firestore;
        this.logger = new common_1.Logger(NotificationsGateway_1.name);
    }
    async handleConnection(client) {
        const token = client.handshake.auth?.token;
        if (!token) {
            client.disconnect(true);
            return;
        }
        try {
            const decoded = await this.auth.verifyIdToken(token);
            const userSnap = await this.firestore.collection(firestore_collections_1.Collections.USERS).doc(decoded.uid).get();
            const role = userSnap.data()?.role;
            if (role !== role_enum_1.Role.ADMIN && role !== role_enum_1.Role.WAREHOUSE_OPERATOR) {
                client.disconnect(true);
                return;
            }
            await client.join(roomFor(role));
        }
        catch {
            client.disconnect(true);
        }
    }
    handleDisconnect(client) {
        this.logger.debug(`Realtime client disconnected: ${client.id}`);
    }
    broadcastToRoles(roles, event, payload) {
        for (const role of roles) {
            this.server.to(roomFor(role)).emit(event, payload);
        }
    }
};
exports.NotificationsGateway = NotificationsGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", Function)
], NotificationsGateway.prototype, "server", void 0);
exports.NotificationsGateway = NotificationsGateway = NotificationsGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({ cors: { origin: '*' }, namespace: 'realtime' }),
    __param(0, (0, common_1.Inject)(firebase_constants_1.FIREBASE_AUTH)),
    __param(1, (0, common_1.Inject)(firebase_constants_1.FIRESTORE)),
    __metadata("design:paramtypes", [Function, Function])
], NotificationsGateway);
//# sourceMappingURL=notifications.gateway.js.map