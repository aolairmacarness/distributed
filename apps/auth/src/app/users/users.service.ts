import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hash } from 'bcryptjs';

@Injectable()
export class UsersService {
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
      // Don't leak Prisma internals (e.g. P2002 unique-constraint details).
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
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
