import InfoRoute, { infoMetadata } from '../../components/InfoRoute';

export const metadata = infoMetadata('faq');

export default function Page() {
  return <InfoRoute kind="faq" />;
}
