import InfoRoute, { infoMetadata } from '../../components/InfoRoute';

export const metadata = infoMetadata('about');

export default function Page() {
  return <InfoRoute kind="about" />;
}
