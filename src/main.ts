// Must be first: env.config.ts reads process.env when it is imported, which
// happens while resolving AppModule below — before Nest's ConfigModule runs.
// Without this, every `env.*` value sourced from .env (JWT_ACCESS_SECRET for
// the chat gateway, REDIS_URL, Twilio, R2, SMTP, Mapbox, RevenueCat) is
// undefined at runtime and the app silently falls back to its no-op paths.
import 'dotenv/config';
import { join } from 'path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors();
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      // One message per field. Without this a single missing value trips every
      // validator on it — @IsString, @IsNotEmpty and @Matches all fire — and
      // the client gets the same thing said three different ways.
      stopAtFirstError: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
