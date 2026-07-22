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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const firebase_constants_1 = require("../../firebase/firebase.constants");
const firestore_collections_1 = require("../../firebase/firestore-collections");
const firestore_repository_1 = require("../../firebase/firestore.repository");
let UsersService = class UsersService {
    constructor(firestore, auth) {
        this.auth = auth;
        this.repo = new firestore_repository_1.FirestoreRepository(firestore, firestore_collections_1.Collections.USERS);
    }
    findAll() {
        return this.repo.findAll({ orderBy: { field: 'createdAt', direction: 'desc' } });
    }
    findById(uid) {
        return this.repo.getOrThrow(uid, 'User not found');
    }
    async findByEmail(email) {
        const userRecord = await this.auth.getUserByEmail(email);
        return this.findById(userRecord.uid);
    }
    async update(uid, dto) {
        return this.repo.update(uid, dto);
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(firebase_constants_1.FIRESTORE)),
    __param(1, (0, common_1.Inject)(firebase_constants_1.FIREBASE_AUTH)),
    __metadata("design:paramtypes", [Function, Function])
], UsersService);
//# sourceMappingURL=users.service.js.map