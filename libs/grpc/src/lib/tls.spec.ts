import { grpcClientCredentials, grpcServerCredentials } from './tls';

const reader = (values: Record<string, string | undefined>) => ({
  get: <T = string>(key: string) => values[key] as T | undefined,
});

describe('gRPC TLS credentials', () => {
  it('returns undefined (plaintext) when nothing is configured', () => {
    expect(grpcServerCredentials(reader({}))).toBeUndefined();
    expect(grpcClientCredentials(reader({}))).toBeUndefined();
  });

  it('fails closed on a partial configuration', () => {
    const partial = reader({ GRPC_TLS_CA_FILE: '/ca.pem' });
    expect(() => grpcServerCredentials(partial)).toThrow(
      /partially configured/,
    );
    expect(() => grpcClientCredentials(partial)).toThrow(
      /partially configured/,
    );
  });
});
