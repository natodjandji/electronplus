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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirebaseAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const firestore_1 = require("firebase-admin/firestore");
const firebase_constants_1 = require("../../firebase/firebase.constants");
const firestore_collections_1 = require("../../firebase/firestore-collections");
const role_enum_1 = require("../enums/role.enum");
function extractBearerToken(authHeader) {
    if (!authHeader)
        return undefined;
    const [scheme, token] = authHeader.split(' ');
    return scheme === 'Bearer' ? token : undefined;
}
let FirebaseAuthGuard = class FirebaseAuthGuard {
    constructor(auth, firestore) {
        this.auth = auth;
        this.firestore = firestore;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const token = extractBearerToken(request.headers.authorization);
        if (!token)
            throw new common_1.UnauthorizedException('Missing bearer token');
        let decoded;
        try {
            decoded = await this.auth.verifyIdToken(token);
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid or expired Firebase ID token');
        }
        request.user = await this.loadOrCreateUser(decoded);
        return true;
    }
    async loadOrCreateUser(decoded) {
        const ref = this.firestore.collection(firestore_collections_1.Collections.USERS).doc(decoded.uid);
        const snap = await ref.get();
        if (!snap.exists) {
            const now = firestore_1.FieldValue.serverTimestamp();
            await ref.set({
                uid: decoded.uid,
                email: decoded.email ?? null,
                displayName: decoded.name ?? null,
                photoURL: decoded.picture ?? null,
                role: role_enum_1.Role.CLIENT,
                active: true,
                createdAt: now,
                updatedAt: now,
            });
            return {
                id: decoded.uid,
                email: decoded.email ?? '',
                role: role_enum_1.Role.CLIENT,
            };
        }
        const data = snap.data();
        return {
            id: decoded.uid,
            email: data.email ?? decoded.email ?? '',
            role: data.role,
        };
    }
};
exports.FirebaseAuthGuard = FirebaseAuthGuard;
exports.FirebaseAuthGuard = FirebaseAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(firebase_constants_1.FIREBASE_AUTH)),
    __param(1, (0, common_1.Inject)(firebase_constants_1.FIRESTORE)),
    __metadata("design:paramtypes", [Function, Function])
], FirebaseAuthGuard);
//# sourceMappingURL=firebase-auth.guard.js.map