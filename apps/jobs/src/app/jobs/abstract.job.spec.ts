import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { FibonacciMessage, PulsarClient } from '@jobber/pulsar';
import { FibonacciJob } from './fibonacci/fibonacci.job';
import { PrismaService } from '../prisma/prisma.service';

describe('AbstractJob (via FibonacciJob)', () => {
  let job: FibonacciJob;
  let send: Mock;
  let create: Mock;

  beforeEach(() => {
    send = vi.fn().mockResolvedValue(undefined);
    create = vi.fn().mockResolvedValue({ id: 7 });
    const pulsarClient = {
      createProducer: vi.fn().mockResolvedValue({ send }),
    } as unknown as PulsarClient;
    const prisma = { job: { create } } as unknown as PrismaService;
    job = new FibonacciJob(pulsarClient, prisma);
  });

  it.each([0, -1, 1.5, 10_001, '5', null])(
    'rejects iterations=%p without creating a job',
    async (iterations) => {
      await expect(
        job.execute({ iterations } as unknown as FibonacciMessage, 'F', 1),
      ).rejects.toThrow(BadRequestException);
      expect(create).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    },
  );

  it('rejects an array with one invalid element before publishing anything', async () => {
    await expect(
      job.execute(
        [{ iterations: 5 }, {}] as unknown as FibonacciMessage[],
        'F',
        1,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(create).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('does not echo submitted values in validation errors', async () => {
    const secret = 'top-secret-file-contents';
    await expect(
      job.execute(
        { iterations: secret } as unknown as FibonacciMessage,
        'F',
        1,
      ),
    ).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining(secret),
      }),
    );
  });

  it('creates an owned job and publishes every valid message', async () => {
    const result = await job.execute(
      [{ iterations: 5 }, { iterations: 10 }] as FibonacciMessage[],
      'F',
      42,
    );
    expect(result).toEqual({ id: 7 });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 42, size: 2 }),
    });
    expect(send).toHaveBeenCalledTimes(2);
  });
});
