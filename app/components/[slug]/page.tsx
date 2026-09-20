import { GalleryEntryView } from '@/components/gallery/gallery-entry';

/**
 * /components/[slug] - one page per component for sharing/screenshots.
 * The slug is resolved client-side against the gallery registry.
 */
export default async function ComponentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <GalleryEntryView slug={slug} />;
}
