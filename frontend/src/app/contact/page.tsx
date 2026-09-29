import InfoRoute, { infoMetadata } from '../../components/InfoRoute';

export const metadata = infoMetadata('contact');

export default function Page() {
  return <InfoRoute kind="contact" />;
}
