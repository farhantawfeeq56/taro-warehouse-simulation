import type { ReactNode } from 'react';
import { warehouseDemos } from './demos/warehouse';
import { interiorDemos } from './demos/interior';
import { uiDemos } from './demos/ui';

/** One shareable page in the /components gallery. */
export interface GalleryEntry {
  slug: string;
  title: string;
  group: GalleryGroup;
  /** One-liner shown on the index card (and above the component). */
  tagline: string;
  /** Full-viewport components render edge to edge with a floating back link. */
  bleed?: boolean;
  render: () => ReactNode;
}

export type GalleryGroup = 'Warehouse' | 'Interior' | 'UI';

export const GALLERY_GROUPS: { id: GalleryGroup; blurb: string }[] = [
  { id: 'Warehouse', blurb: 'The simulation product surface.' },
  { id: 'Interior', blurb: 'Motion micro-interactions used inside the app.' },
  { id: 'UI', blurb: 'Design-system primitives.' },
];

export const GALLERY: GalleryEntry[] = [...warehouseDemos, ...interiorDemos, ...uiDemos];

export function galleryEntry(slug: string): GalleryEntry | undefined {
  return GALLERY.find((entry) => entry.slug === slug);
}
