import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { AuthClientModule } from '../auth-client.module';

@Module({
  imports: [AuthClientModule],
  controllers: [UploadsController],
})
export class UploadsModule {}
