import { Module } from '@nestjs/common';
import { ImagesModule } from '../images/images.module.js';
import { FaceVerificationController } from './face-verification.controller.js';
import { FaceVerificationService } from './face-verification.service.js';

@Module({
  imports: [ImagesModule],
  controllers: [FaceVerificationController],
  providers: [FaceVerificationService],
  exports: [FaceVerificationService],
})
export class FaceVerificationModule {}
