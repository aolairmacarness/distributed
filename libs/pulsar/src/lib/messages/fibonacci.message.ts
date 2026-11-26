import { IsInt, Max, Min } from 'class-validator';
import { JobMessage } from './job.message';

/** Upper bound keeps the synchronous Fibonacci loop short. */
export const MAX_FIBONACCI_ITERATIONS = 10_000;

export class FibonacciMessage extends JobMessage {
  @IsInt()
  @Min(1)
  @Max(MAX_FIBONACCI_ITERATIONS)
  iterations: number;
}
