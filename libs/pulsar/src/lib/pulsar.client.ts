import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuthenticationToken,
  Client,
  Consumer,
  Message,
  Producer,
} from 'pulsar-client';
import { MAX_REDELIVER_COUNT } from './constants';

@Injectable()
export class PulsarClient implements OnModuleDestroy {
  // Optional hardening, off unless configured:
  //   PULSAR_AUTH_TOKEN            JWT for Pulsar token authentication
  //   PULSAR_TLS_TRUST_CERTS_FILE  CA bundle for a pulsar+ssl:// service URL
  private readonly client = new Client({
    serviceUrl: this.configService.getOrThrow<string>('PULSAR_SERVICE_URL'),
    ...(this.configService.get<string>('PULSAR_AUTH_TOKEN')
      ? {
          authentication: new AuthenticationToken({
            token: this.configService.getOrThrow<string>('PULSAR_AUTH_TOKEN'),
          }),
        }
      : {}),
    ...(this.configService.get<string>('PULSAR_TLS_TRUST_CERTS_FILE')
      ? {
          tlsTrustCertsFilePath: this.configService.get<string>(
            'PULSAR_TLS_TRUST_CERTS_FILE',
          ),
          tlsValidateHostname: true,
        }
      : {}),
  });
  private readonly producers: Producer[] = [];
  private readonly consumers: Consumer[] = [];

  constructor(private readonly configService: ConfigService) {}

  async createProducer(topic: string) {
    const producer = await this.client.createProducer({
      blockIfQueueFull: true,
      topic,
    });
    this.producers.push(producer);
    return producer;
  }

  async createConsumer(topic: string, listener: (message: Message) => void) {
    const consumer = await this.client.subscribe({
      subscriptionType: 'Shared',
      topic,
      subscription: 'jobber',
      listener,
      nAckRedeliverTimeoutMs: 10_000,
      deadLetterPolicy: {
        deadLetterTopic: `${topic}-DLQ`,
        maxRedeliverCount: MAX_REDELIVER_COUNT,
      },
    });
    this.consumers.push(consumer);
    return consumer;
  }

  async onModuleDestroy() {
    for (const producer of this.producers) {
      await producer.close();
    }
    await this.client.close();
  }
}
