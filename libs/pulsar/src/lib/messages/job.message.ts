import { IsInt, Min } from 'class-validator';

export class JobMessage {
  @IsInt()
  @Min(1)
  jobId: number;
}
