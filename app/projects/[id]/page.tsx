import { redirect } from 'next/navigation';

/**
 * Project URLs are legacy (dashboard era). Projects no longer exist — every
 * visit starts a fresh in-memory warehouse session on the main page.
 */
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params;
  redirect('/');
}
