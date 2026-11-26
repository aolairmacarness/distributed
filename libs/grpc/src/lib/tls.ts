import {
  ChannelCredentials,
  credentials,
  ServerCredentials,
} from '@grpc/grpc-js';
import { readFileSync } from 'fs';

/**
 * Optional mutual TLS for service-to-service gRPC.
 *
 * Set all three variables (PEM file paths) on every service to enable it:
 *   GRPC_TLS_CA_FILE    CA that signed every service's certificate
 *   GRPC_TLS_CERT_FILE  this service's certificate
 *   GRPC_TLS_KEY_FILE   this service's private key
 *
 * Servers then require a client certificate signed by the CA, and clients
 * verify the server certificate. The server certificate's SAN must match
 * the host in the *_GRPC_SERVICE_URL clients use (e.g. `auth-grpc`).
 *
 * If none are set, gRPC stays plaintext (previous behaviour). A partial
 * configuration is rejected at startup rather than silently ignored.
 */
interface ConfigReader {
  get<T = string>(key: string): T | undefined;
}

interface TlsMaterial {
  ca: Buffer;
  cert: Buffer;
  key: Buffer;
}

const KEYS = [
  'GRPC_TLS_CA_FILE',
  'GRPC_TLS_CERT_FILE',
  'GRPC_TLS_KEY_FILE',
] as const;

function loadTlsMaterial(config: ConfigReader): TlsMaterial | undefined {
  const [caFile, certFile, keyFile] = KEYS.map((k) => config.get<string>(k));
  const set = [caFile, certFile, keyFile].filter(Boolean).length;
  if (set === 0) {
    return undefined;
  }
  if (set !== KEYS.length) {
    throw new Error(
      `gRPC TLS is partially configured: set all of ${KEYS.join(', ')} or none.`,
    );
  }
  return {
    ca: readFileSync(caFile as string),
    cert: readFileSync(certFile as string),
    key: readFileSync(keyFile as string),
  };
}

/** Server credentials (mTLS: client certificates are required). */
export function grpcServerCredentials(
  config: ConfigReader,
): ServerCredentials | undefined {
  const tls = loadTlsMaterial(config);
  if (!tls) {
    return undefined;
  }
  return ServerCredentials.createSsl(
    tls.ca,
    [{ cert_chain: tls.cert, private_key: tls.key }],
    true,
  );
}

/** Client credentials presenting this service's certificate. */
export function grpcClientCredentials(
  config: ConfigReader,
): ChannelCredentials | undefined {
  const tls = loadTlsMaterial(config);
  if (!tls) {
    return undefined;
  }
  return credentials.createSsl(tls.ca, tls.key, tls.cert);
}
