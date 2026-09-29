import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CartModule } from '../cart/cart.module';
import { HdfcController } from './hdfc/hdfc.controller';
import { HdfcGatewayService } from './hdfc/hdfc-gateway.service';
import { HdfcPaymentsService } from './hdfc/hdfc-payments.service';
import { PaymentAdminController } from './payment-admin.controller';
import { PaymentQueueService } from './payment-queue.service';
import { WebhookProcessorService } from './webhook-processor.service';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [AuthModule, CartModule],
  controllers: [HdfcController, WebhooksController, PaymentAdminController],
  providers: [
    HdfcGatewayService,
    HdfcPaymentsService,
    WebhookProcessorService,
    PaymentQueueService,
    WebhooksService,
  ],
  exports: [HdfcGatewayService, HdfcPaymentsService],
})
export class PaymentsModule {}
