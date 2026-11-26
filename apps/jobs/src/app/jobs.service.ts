import {
  DiscoveredClassWithMeta,
  DiscoveryService,
} from '@golevelup/nestjs-discovery';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { JOB_METADATA_KEY } from './decorators/job.decorator';
import { AbstractJob } from './jobs/abstract.job';
import { JobMetadata } from './interfaces/job-metadata.interface';
import { readFile } from 'fs/promises';
import { resolveUploadPath } from './uploads/upload';
import { PrismaService } from './prisma/prisma.service';
import { JobStatus } from './models/job-status.enum';

@Injectable()
export class JobsService implements OnModuleInit {
  private jobs: DiscoveredClassWithMeta<JobMetadata>[] = [];

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly prismaService: PrismaService,
  ) {}

  async onModuleInit() {
    this.jobs =
      await this.discoveryService.providersWithMetaAtKey<JobMetadata>(
        JOB_METADATA_KEY,
      );
  }

  getJobsMetadata() {
    return this.jobs.map((job) => job.meta);
  }

  async getJob(id: number, userId: number) {
    const job = await this.prismaService.job.findFirst({
      where: { id, userId },
    });
    if (!job) {
      throw new NotFoundException(`Job with ID ${id} does not exist.`);
    }
    return job;
  }

  async getJobs(userId: number) {
    return this.prismaService.job.findMany({ where: { userId } });
  }

  async executeJob(name: string, data: any, userId: number) {
    const job = this.jobs.find((job) => job.meta.name === name);
    if (!job) {
      throw new BadRequestException(`Job ${name} does not exist.`);
    }
    if (!(job.discoveredClass.instance instanceof AbstractJob)) {
      throw new InternalServerErrorException(
        'Job is not an instance of AbstractJob.',
      );
    }
    const payload =
      data && !Array.isArray(data) && 'fileName' in data
        ? await this.getFile(data.fileName)
        : data;
    return job.discoveredClass.instance.execute(payload, job.meta.name, userId);
  }

  async acknowledge(jobId: number) {
    const job = await this.prismaService.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new BadRequestException(`Job with ID ${jobId} does not exist.`);
    }

    if (job.ended) {
      return;
    }

    const updatedJob = await this.prismaService.job.update({
      where: { id: jobId },
      data: { completed: { increment: 1 } },
    });

    if (updatedJob.completed >= job.size) {
      // Conditional update so concurrent acks can't double-finish the job.
      await this.prismaService.job.updateMany({
        where: { id: jobId, ended: null },
        data: { status: JobStatus.COMPLETED, ended: new Date() },
      });
    }

    return updatedJob;
  }

  /** Marks a job FAILED after a message exhausted its redeliveries. */
  async fail(jobId: number) {
    await this.prismaService.job.updateMany({
      where: { id: jobId, ended: null },
      data: { status: JobStatus.FAILED, ended: new Date() },
    });
  }

  private async getFile(fileName: unknown) {
    const filePath = resolveUploadPath(fileName);
    let contents: string;
    try {
      contents = await readFile(filePath, 'utf-8');
    } catch {
      throw new BadRequestException('File not found.');
    }
    try {
      return JSON.parse(contents);
    } catch {
      throw new BadRequestException('File is not valid JSON.');
    }
  }
}
