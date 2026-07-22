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
exports.QuotesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const role_enum_1 = require("../../common/enums/role.enum");
const firebase_auth_guard_1 = require("../../common/guards/firebase-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const add_quote_line_dto_1 = require("./dto/add-quote-line.dto");
const create_quote_dto_1 = require("./dto/create-quote.dto");
const reject_quote_dto_1 = require("./dto/reject-quote.dto");
const set_global_discount_dto_1 = require("./dto/set-global-discount.dto");
const update_quote_line_dto_1 = require("./dto/update-quote-line.dto");
const quote_totals_1 = require("./quote-totals");
const quotes_service_1 = require("./quotes.service");
let QuotesController = class QuotesController {
    constructor(quotesService) {
        this.quotesService = quotesService;
    }
    create(user, dto) {
        return this.quotesService.create(user, dto);
    }
    findMine(user) {
        return this.quotesService.findMine(user);
    }
    findAll() {
        return this.quotesService.findAll();
    }
    async findOne(id, user) {
        const quote = await this.quotesService.findOneForUser(id, user);
        return { ...quote, totals: (0, quote_totals_1.computeQuoteTotals)(quote) };
    }
    addLine(id, user, dto) {
        return this.quotesService.addLine(id, user, dto);
    }
    updateLine(id, lineId, user, dto) {
        return this.quotesService.updateLine(id, lineId, user, dto);
    }
    removeLine(id, lineId, user) {
        return this.quotesService.removeLine(id, lineId, user);
    }
    setGlobalDiscount(id, user, dto) {
        return this.quotesService.setGlobalDiscount(id, user, dto.globalDiscountPct);
    }
    send(id, user) {
        return this.quotesService.send(id, user);
    }
    approve(id, user) {
        return this.quotesService.approve(id, user);
    }
    reject(id, user, dto) {
        return this.quotesService.reject(id, user, dto.reason);
    }
};
exports.QuotesController = QuotesController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_quote_dto_1.CreateQuoteDto]),
    __metadata("design:returntype", void 0)
], QuotesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('mine'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], QuotesController.prototype, "findMine", null);
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(role_enum_1.Role.ADMIN),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], QuotesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], QuotesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(':id/lines'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, add_quote_line_dto_1.AddQuoteLineDto]),
    __metadata("design:returntype", void 0)
], QuotesController.prototype, "addLine", null);
__decorate([
    (0, common_1.Patch)(':id/lines/:lineId'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('lineId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, update_quote_line_dto_1.UpdateQuoteLineDto]),
    __metadata("design:returntype", void 0)
], QuotesController.prototype, "updateLine", null);
__decorate([
    (0, common_1.Delete)(':id/lines/:lineId'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('lineId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], QuotesController.prototype, "removeLine", null);
__decorate([
    (0, common_1.Patch)(':id/discount'),
    (0, roles_decorator_1.Roles)(role_enum_1.Role.ADMIN),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, set_global_discount_dto_1.SetGlobalDiscountDto]),
    __metadata("design:returntype", void 0)
], QuotesController.prototype, "setGlobalDiscount", null);
__decorate([
    (0, common_1.Post)(':id/send'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], QuotesController.prototype, "send", null);
__decorate([
    (0, common_1.Post)(':id/approve'),
    (0, roles_decorator_1.Roles)(role_enum_1.Role.ADMIN),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], QuotesController.prototype, "approve", null);
__decorate([
    (0, common_1.Post)(':id/reject'),
    (0, roles_decorator_1.Roles)(role_enum_1.Role.ADMIN),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, reject_quote_dto_1.RejectQuoteDto]),
    __metadata("design:returntype", void 0)
], QuotesController.prototype, "reject", null);
exports.QuotesController = QuotesController = __decorate([
    (0, swagger_1.ApiTags)('quotes'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('quotes'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [quotes_service_1.QuotesService])
], QuotesController);
//# sourceMappingURL=quotes.controller.js.map