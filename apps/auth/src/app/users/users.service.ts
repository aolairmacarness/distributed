import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hash } from 'bcryptjs';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prismaService: PrismaService) {}

  async createUser(data: Prisma.UserCreateInput) {
    try {
      return await this.prismaService.user.create({
        data: {
          ...data,
          password: await hash(data.password, 10),
        },
      });
    } catch (err) {
      // Don't leak Prisma internals (e.g. P2002 unique-constraint details)
      // to the caller, but keep the code and message in the server log.
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        this.logger.warn(`createUser failed: ${err.code} ${err.message}`);
        throw new BadRequestException('Unable to create user.');
      }
      throw err;
    }
  }

  async getUser(args: Prisma.UserWhereUniqueInput) {
    return this.prismaService.user.findUniqueOrThrow({
      where: args,
    });
  }
}
