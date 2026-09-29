import InfoRoute, { infoMetadata } from '../../components/InfoRoute';

export const metadata = infoMetadata('terms');

export default function Page() {
  return <InfoRoute kind="terms" />;
}
