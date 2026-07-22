"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const app_module_1 = require("../../app.module");
const role_enum_1 = require("../../common/enums/role.enum");
const users_service_1 = require("../../modules/users/users.service");
const logger = new common_1.Logger('SetUserRole');
async function run() {
    const [email, role] = process.argv.slice(2);
    if (!email || !role) {
        logger.error('Usage: npm run set-user-role -- <email> <client|admin|warehouse_operator>');
        process.exit(1);
    }
    if (!Object.values(role_enum_1.Role).includes(role)) {
        logger.error(`Invalid role "${role}". Valid roles: ${Object.values(role_enum_1.Role).join(', ')}`);
        process.exit(1);
    }
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule, { logger: ['error', 'warn'] });
    const usersService = app.get(users_service_1.UsersService);
    try {
        const user = await usersService.findByEmail(email);
        const updated = await usersService.update(user.id, { role: role });
        logger.log(`Updated ${email} (uid ${updated.id}) → role=${updated.role}`);
    }
    catch (error) {
        logger.error(`Could not update ${email}. Have they signed in at least once? ${error.message}`);
        process.exit(1);
    }
    await app.close();
    process.exit(0);
}
run();
//# sourceMappingURL=set-user-role.js.map