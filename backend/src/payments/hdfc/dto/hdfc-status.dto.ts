import { IsOptional, IsUUID, Matches, ValidateIf } from 'class-validator';

/** Either the local order id or the SmartGateway `order_id` from the return URL. */
export class HdfcStatusDto {
  @ValidateIf((input: HdfcStatusDto) => !input.hdfcOrderId)
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @Matches(/^[A-Za-z0-9]{1,20}$/)
  hdfcOrderId?: string;
}
