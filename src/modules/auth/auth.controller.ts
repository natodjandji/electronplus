import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UsersService } from '../users/users.service';

/**
 * Google Sign-In itself happens client-side via the Firebase SDK. These
 * routes just verify the resulting ID token (FirebaseAuthGuard, which also
 * upserts users/{uid} on first sign-in) and hand back the app-level
 * profile the frontend's auth context needs.
 */
@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
@UseGuards(FirebaseAuthGuard)
export class AuthController {
  constructor(private readonly usersService: UsersService) {}

  @Post('session')
  @HttpCode(HttpStatus.OK)
  session(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findById(user.id);
  }
}
