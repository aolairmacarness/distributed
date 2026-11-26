import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { User } from './models/user.model';
import { UsersService } from './users.service';
import { CreateUserInput } from './dto/create-user.input';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { TokenPayload } from '../auth/token-payload.interface';
import { GqlThrottlerGuard } from '../auth/guards/gql-throttler.guard';

@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(GqlThrottlerGuard)
  @Mutation(() => User)
  async createUser(@Args('createUserInput') createUserInput: CreateUserInput) {
    return this.usersService.createUser(createUserInput);
  }

  /** Returns only the calling user; listing every account is not exposed. */
  @UseGuards(GqlAuthGuard)
  @Query(() => User, { name: 'me' })
  async me(@CurrentUser() { userId }: TokenPayload) {
    return this.usersService.getUser({ id: userId });
  }
}
