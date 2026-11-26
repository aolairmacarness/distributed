import { Consumer, Message } from 'pulsar-client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PulsarClient } from './pulsar.client';
import { deserialize } from './serialize';
import { Logger } from '@nestjs/common';
import { MAX_REDELIVER_COUNT } from './constants';

export abstract class PulsarConsumer<T extends object> {
  private consumer!: Consumer;
  protected readonly logger = new Logger(this.topic);

  constructor(
    private readonly pulsarClient: PulsarClient,
    private readonly topic: string,
    /** When set, every message is validated against this class first. */
    private readonly messageClass?: new () => T,
  ) {}

  async onModuleInit() {
    this.consumer = await this.pulsarClient.createConsumer(
      this.topic,
      this.listener.bind(this),
    );
  }

  private async listener(message: Message) {
    let data: T;
    try {
      data = await this.parse(message);
    } catch (err) {
      // Malformed or invalid payloads will never succeed; drop them.
      this.logger.error(`Discarding invalid message: ${String(err)}`);
      await this.onInvalidMessage?.(message);
      await this.consumer.acknowledge(message);
      return;
    }

    try {
      await this.onMessage(data);
      await this.consumer.acknowledge(message);
    } catch (err) {
      const isFinalAttempt =
        message.getRedeliveryCount() >= MAX_REDELIVER_COUNT - 1;
      this.logger.error(
        `Message failed (delivery ${message.getRedeliveryCount() + 1}/` +
          `${MAX_REDELIVER_COUNT}): ${String(err)}`,
      );
      if (isFinalAttempt && this.onFinalFailure) {
        await this.onFinalFailure(data, err).catch((hookErr) =>
          this.logger.error(`onFinalFailure failed: ${String(hookErr)}`),
        );
      }
      // Redeliver later; once MAX_REDELIVER_COUNT is reached the client
      // routes the message to the dead-letter topic instead.
      this.consumer.negativeAcknowledge(message);
    }
  }

  private async parse(message: Message): Promise<T> {
    const raw = deserialize<unknown>(message.getData());
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new Error('payload is not an object');
    }
    if (!this.messageClass) {
      return raw as T;
    }
    const instance = plainToInstance(this.messageClass, raw);
    const errors = await validate(instance, {
      whitelist: true,
      forbidUnknownValues: true,
      validationError: { target: false, value: false },
    });
    if (errors.length) {
      throw new Error(
        `validation failed: ${errors.map((e) => e.property).join(', ')}`,
      );
    }
    return instance;
  }

  protected abstract onMessage(data: T): Promise<void>;

  /** Optional hook: a message failed its last allowed delivery. */
  protected onFinalFailure?(data: T, err: unknown): Promise<void>;

  /** Optional hook: a message could not be parsed or validated. */
  protected onInvalidMessage?(message: Message): Promise<void>;
}
