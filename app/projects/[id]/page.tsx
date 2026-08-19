import { TaroApp } from '@/components/taro/taro-app';

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TaroApp initialProjectId={id} />
    </div>
  );
}
