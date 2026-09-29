import { serializeJsonLd } from '../lib/structured-data';

const JsonLd = ({ data }: { data: unknown }) => (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />
);

export default JsonLd;
