import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { HdfcGatewayService } from './hdfc/hdfc-gateway.service';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly gateway: HdfcGatewayService,
  ) {}

  /**
   * HDFC SmartGateway webhook URL (Dashboard → Payments → Settings → Webhook).
   * CSRF-exempt (see CsrfService); authenticated with the dashboard Basic
   * credentials. SmartGateway re-sends until it receives HTTP 200.
   */
  @Post('hdfc')
  @HttpCode(HttpStatus.OK)
  async hdfc(
    @Req() request: RawBodyRequest<Request>,
    @Headers('authorization') authorization?: string,
  ): Promise<{ received: true }> {
    if (!this.gateway.verifyWebhookAuthorization(authorization)) {
      throw new UnauthorizedException('Invalid HDFC webhook credentials');
    }
    if (!request.rawBody) {
      throw new UnauthorizedException('HDFC webhook body is missing');
    }
    await this.webhooks.ingest(request.rawBody);
    return { received: true };
  }
}
