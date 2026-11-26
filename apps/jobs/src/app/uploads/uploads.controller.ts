import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Express } from 'express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { FileInterceptor } from '@nestjs/platform-express';
import { GqlAuthGuard } from '@jobber/graphql';
import { MAX_UPLOAD_BYTES, UPLOAD_FILE_PATH } from './upload';

@Controller('uploads')
export class UploadsController {
  @Post('upload')
  @UseGuards(GqlAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOAD_FILE_PATH,
        filename: (_req, _file, callback) => {
          callback(null, `file-${randomUUID()}.json`);
        },
      }),
      limits: {
        fileSize: MAX_UPLOAD_BYTES,
        files: 1,
        fields: 10,
      },
      fileFilter: (_req, file, callback) => {
        if (
          file.mimetype !== 'application/json' ||
          extname(file.originalname).toLowerCase() !== '.json'
        ) {
          return callback(
            new BadRequestException('Only JSON files are allowed!'),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded.');
    }
    return {
      message: 'File uploaded successfully',
      filename: file.filename,
    };
  }
}
