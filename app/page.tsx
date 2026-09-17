import { TaroApp } from '@/components/taro/taro-app';

/**
 * Session-only entry point.
 *
 * Every visit starts a fresh, in-memory warehouse session - there is no
 * project dashboard and no database persistence. The TaroApp generates a
 * new warehouse in the browser and everything (edits, orders) lives only
 * for the duration of the page.
 */
export default function Page() {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TaroApp />
    </div>
  );
}
