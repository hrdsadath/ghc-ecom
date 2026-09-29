import { Body, Controller, Headers, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Order } from '@prisma/client';
import { AuthorizationValue } from '../../auth/decorators/authorization-value.decorator';
import { CreateHdfcIntentDto } from './dto/create-hdfc-intent.dto';
import { HdfcStatusDto } from './dto/hdfc-status.dto';
import { HdfcPaymentIntent, HdfcPaymentsService } from './hdfc-payments.service';

/**
 * HDFC SmartGateway (hosted payment page).
 *
 * The session `return_url` is the storefront `/checkout/result` page, which calls
 * `payments/hdfc/status`. Webhooks arrive through WebhooksController.
 */
@Controller()
export class HdfcController {
  constructor(private readonly payments: HdfcPaymentsService) {}

  @Post('checkout/hdfc/intent')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createIntent(
    @Body() input: CreateHdfcIntentDto,
    @AuthorizationValue() authorization?: string,
    @Headers('x-cart-token') guestToken?: string,
  ): Promise<HdfcPaymentIntent> {
    return this.payments.createIntent(input, authorization, guestToken);
  }

  @Post('payments/hdfc/status')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  status(
    @Body() input: HdfcStatusDto,
    @AuthorizationValue() authorization?: string,
    @Headers('x-cart-token') guestToken?: string,
  ): Promise<Order> {
    return this.payments.resolveStatus(input, authorization, guestToken);
  }
}
