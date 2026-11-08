import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = new DocumentBuilder()
    .setTitle('SeatRush API')
    .setDescription(
      'Row indexes and zone numbers are zero-based (row index 0 is row A, nearest the stage). Seat numbers start at 1, so seat B7 is { rowIndex: 1, seatNumber: 7 }. Fan requests use the X-Username header.',
    )
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}

void bootstrap();
