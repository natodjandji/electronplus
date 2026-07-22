import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { Role } from '../../common/enums/role.enum';
import { UsersService } from '../../modules/users/users.service';

const logger = new Logger('SetUserRole');

async function run() {
  const [email, role] = process.argv.slice(2);
  if (!email || !role) {
    logger.error('Usage: npm run set-user-role -- <email> <client|admin|warehouse_operator>');
    process.exit(1);
  }
  if (!Object.values(Role).includes(role as Role)) {
    logger.error(`Invalid role "${role}". Valid roles: ${Object.values(Role).join(', ')}`);
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const usersService = app.get(UsersService);

  try {
    const user = await usersService.findByEmail(email);
    const updated = await usersService.update(user.id, { role: role as Role });
    logger.log(`Updated ${email} (uid ${updated.id}) → role=${updated.role}`);
  } catch (error) {
    logger.error(`Could not update ${email}. Have they signed in at least once? ${(error as Error).message}`);
    process.exit(1);
  }

  await app.close();
  process.exit(0);
}

run();
