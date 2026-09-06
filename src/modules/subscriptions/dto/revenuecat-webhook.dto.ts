import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class RevenueCatEventDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  app_user_id: string;

  @IsString()
  @IsNotEmpty()
  product_id: string;

  @IsOptional()
  purchased_at_ms?: number;

  @IsOptional()
  expiration_at_ms?: number;

  @IsOptional()
  price_in_purchased_currency?: number;

  @IsOptional()
  currency?: string;

  @IsOptional()
  store?: string;

  @IsOptional()
  environment?: string;
}

export class RevenueCatWebhookDto {
  @IsObject()
  @IsNotEmpty()
  event: RevenueCatEventDto;

  @IsOptional()
  @IsString()
  api_version?: string;
}
