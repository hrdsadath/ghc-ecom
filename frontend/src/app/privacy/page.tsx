import InfoRoute, { infoMetadata } from '../../components/InfoRoute';

export const metadata = infoMetadata('privacy');

export default function Page() {
  return <InfoRoute kind="privacy" />;
}
