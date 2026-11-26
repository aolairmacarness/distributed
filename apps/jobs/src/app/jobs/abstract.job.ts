import { Producer } from 'pulsar-client';
import { plainToInstance } from 'class-transformer';
import { PulsarClient, serialize } from '@jobber/pulsar';
import { validate } from 'class-validator';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobStatus } from '../models/job-status.enum';

/** Upper bound on messages per job, to bound queue and DB load. */
const MAX_MESSAGES_PER_JOB = 10_000;

export abstract class AbstractJob<T extends object> {
  private producer: Producer;
  protected abstract messageClass: new () => T;

  constructor(
    private readonly pulsarClient: PulsarClient,
    private readonly prismaService: PrismaService,
  ) {}

  async execute(data: T | T[], name: string, userId: number) {
    const messages = Array.isArray(data) ? data : [data];
    if (messages.length === 0) {
      throw new BadRequestException('Job data must not be empty.');
    }
    if (messages.length > MAX_MESSAGES_PER_JOB) {
      throw new BadRequestException(
        `Job data must not exceed ${MAX_MESSAGES_PER_JOB} messages.`,
      );
    }

    // Validate every message before creating the job or publishing anything,
    // so an invalid element can't leave a half-published job behind.
    for (const [index, message] of messages.entries()) {
      await this.validateData(message, index);
    }

    if (!this.producer) {
      this.producer = await this.pulsarClient.createProducer(name);
    }
    const job = await this.prismaService.job.create({
      data: {
        name,
        userId,
        size: messages.length,
        completed: 0,
        status: JobStatus.IN_PROGRESS,
      },
    });

    await Promise.all(
      messages.map((message) =>
        this.producer.send({ data: serialize({ ...message, jobId: job.id }) }),
      ),
    );
    return job;
  }

  private async validateData(data: unknown, index: number) {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new BadRequestException(
        `Job data is invalid at index ${index}: expected an object.`,
      );
    }
    // jobId is assigned after validation, so use a valid placeholder here.
    const candidate = { ...data, jobId: 1 };
    const errors = await validate(
      plainToInstance(this.messageClass, candidate),
      {
        forbidUnknownValues: true,
        validationError: { target: false, value: false },
      },
    );
    if (errors.length) {
      // Only report property names and constraint messages; never echo
      // the submitted values back to the caller.
      const details = errors.map((e) => ({
        property: e.property,
        constraints: e.constraints,
      }));
      throw new BadRequestException(
        `Job data is invalid at index ${index}: ${JSON.stringify(details)}`,
      );
    }
  }
}
