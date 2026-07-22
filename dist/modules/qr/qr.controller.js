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
exports.QrController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const role_enum_1 = require("../../common/enums/role.enum");
const firebase_auth_guard_1 = require("../../common/guards/firebase-auth.guard");
const optional_firebase_auth_guard_1 = require("../../common/guards/optional-firebase-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const bulk_labels_dto_1 = require("./dto/bulk-labels.dto");
const qr_service_1 = require("./qr.service");
let QrController = class QrController {
    constructor(qrService) {
        this.qrService = qrService;
    }
    issueToken(productId) {
        return this.qrService.issueLabel(productId);
    }
    bulkLabels(dto) {
        return this.qrService.issueLabels(dto.productIds);
    }
    scan(token, user) {
        return this.qrService.scan(token, user);
    }
};
exports.QrController = QrController;
__decorate([
    (0, common_1.Post)('tokens/:productId'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(role_enum_1.Role.ADMIN, role_enum_1.Role.WAREHOUSE_OPERATOR),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Param)('productId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], QrController.prototype, "issueToken", null);
__decorate([
    (0, common_1.Post)('labels'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(role_enum_1.Role.ADMIN, role_enum_1.Role.WAREHOUSE_OPERATOR),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bulk_labels_dto_1.BulkLabelsDto]),
    __metadata("design:returntype", void 0)
], QrController.prototype, "bulkLabels", null);
__decorate([
    (0, common_1.Get)('scan/:token'),
    (0, common_1.UseGuards)(optional_firebase_auth_guard_1.OptionalFirebaseAuthGuard),
    __param(0, (0, common_1.Param)('token')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], QrController.prototype, "scan", null);
exports.QrController = QrController = __decorate([
    (0, swagger_1.ApiTags)('qr'),
    (0, common_1.Controller)('qr'),
    __metadata("design:paramtypes", [qr_service_1.QrService])
], QrController);
//# sourceMappingURL=qr.controller.js.map