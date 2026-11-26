import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { JobsService } from './jobs.service';
import { ExecuteJobInput } from './dto/execute-job.input';
import { UseGuards } from '@nestjs/common';
import { CurrentUser, GqlAuthGuard } from '@jobber/graphql';
import { Job } from './models/job.model';
import { JobMetadata } from './models/job-metadata.model';

interface AuthenticatedUser {
  id: number;
  email: string;
}

@Resolver()
export class JobsResolver {
  constructor(private readonly jobsService: JobsService) {}

  @Query(() => [JobMetadata], { name: 'jobsMetadata' })
  @UseGuards(GqlAuthGuard)
  async getJobsMetadata() {
    return this.jobsService.getJobsMetadata();
  }

  @Mutation(() => Job)
  @UseGuards(GqlAuthGuard)
  async executeJob(
    @Args('executeJobInput') executeJobInput: ExecuteJobInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobsService.executeJob(
      executeJobInput.name,
      executeJobInput.data,
      user.id,
    );
  }

  @Query(() => [Job], { name: 'jobs' })
  @UseGuards(GqlAuthGuard)
  async getJobs(@CurrentUser() user: AuthenticatedUser) {
    return this.jobsService.getJobs(user.id);
  }

  @Query(() => Job, { name: 'job' })
  @UseGuards(GqlAuthGuard)
  async getJob(
    @Args('id', { type: () => Int }) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobsService.getJob(id, user.id);
  }
}
