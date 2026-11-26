import { Injectable, UnauthorizedException } from '@nestjs/common';
import { LoginInput } from './dto/login.input';
import { Response } from 'express';
import { UsersService } from '../users/users.service';
import { compare, hashSync } from 'bcryptjs';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { TokenPayload } from './token-payload.interface';
import { JwtService } from '@nestjs/jwt';

// Hash of a random value (same cost as real passwords). Compared against
// when the user does not exist so unknown emails take as long as wrong
// passwords.
const DUMMY_PASSWORD_HASH = hashSync(randomUUID(), 10);

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async login({ email, password }: LoginInput, response: Response) {
    const user = await this.verifyUser(email, password);
    const expires = new Date();
    expires.setMilliseconds(
      expires.getMilliseconds() +
        parseInt(this.configService.getOrThrow('JWT_EXPIRATION_MS')),
    );
    const tokenPayload: TokenPayload = {
      userId: user.id,
    };
    const accessToken = this.jwtService.sign(tokenPayload);
    response.cookie('Authentication', accessToken, {
      httpOnly: true,
      // Secure by default; set SECURE_COOKIE=false only for plain-HTTP dev.
      secure: this.configService.get('SECURE_COOKIE') !== 'false',
      sameSite: 'strict',
      expires,
    });
    return user;
  }

  private async verifyUser(email: string, password: string) {
    const user = await this.usersService.getUser({ email }).catch(() => null);
    const authenticated = await compare(
      password,
      user?.password ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !authenticated) {
      throw new UnauthorizedException('Credentials are not valid.');
    }
    return user;
  }
}
