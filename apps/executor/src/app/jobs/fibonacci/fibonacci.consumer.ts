import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  FibonacciMessage,
  MAX_FIBONACCI_ITERATIONS,
  PulsarClient,
} from '@jobber/pulsar';
import { iterate } from 'fibonacci';
import { Jobs } from '@jobber/nestjs';
import { JobConsumer } from '../job.consumer';
import { Packages } from '@jobber/grpc';
import { ClientGrpc } from '@nestjs/microservices';

@Injectable()
export class FibonacciConsumer
  extends JobConsumer<FibonacciMessage>
  implements OnModuleInit
{
  constructor(
    @Inject(Packages.JOBS) clientJobs: ClientGrpc,
    pulsarClient: PulsarClient,
  ) {
    super(Jobs.FIBONACCI, pulsarClient, clientJobs, FibonacciMessage);
  }

  protected async execute(data: FibonacciMessage): Promise<void> {
    // Defence in depth: `iterate` loops forever on 0, negative or
    // fractional limits, and blocks the event loop on huge ones.
    if (
      !Number.isInteger(data.iterations) ||
      data.iterations < 1 ||
      data.iterations > MAX_FIBONACCI_ITERATIONS
    ) {
      throw new Error(`Invalid iterations: ${data.iterations}`);
    }
    const result = iterate(data.iterations);
    this.logger.log(result);
  }
}
