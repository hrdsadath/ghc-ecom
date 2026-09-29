import InfoRoute, { infoMetadata } from '../../components/InfoRoute';

export const metadata = infoMetadata('shipping');

export default function Page() {
  return <InfoRoute kind="shipping" />;
}
