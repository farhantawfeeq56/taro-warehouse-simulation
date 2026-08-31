import { Badge } from '@/components/ui/badge';
import { Heart, MapPin, PackageCheck, Warehouse, HandHeart, PartyPopper } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * /letter — the farewell letter. Not linked anywhere in the app; only
 * reachable by typing the URL. Styled with the Taro design tokens
 * (warm paper background, olive accent) and a bit of warehouse flair.
 */

/* A small shelf glyph drawn with divs — inline so the letter page has zero
   SVG/dependency overhead. */
function ShelfRow({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-end justify-center gap-3', className)}>
      {[26, 38, 30, 44, 24].map((h, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <div className="h-2.5 w-8 rounded-sm bg-accent/25" />
          <div className="flex w-10 items-end justify-center gap-1 rounded-md bg-accent px-1 pb-1 pt-2" style={{ height: h }}>
            <div className="h-2 w-2 rounded-full bg-accent-soft" />
            <div className="h-2.5 w-2 rounded-full bg-accent/70" />
            <div className="h-1.5 w-2 rounded-full bg-accent-soft" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Highlight({ children }: { children: React.ReactNode }) {
  return (
    <mark className="rounded-[3px] bg-accent-soft px-1 py-0.5 text-inherit [box-decoration-break:clone]">
      {children}
    </mark>
  );
}

function Annotation({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'absolute hidden rounded-md border border-dashed border-accent/40 bg-surface/80 px-2 py-1 text-[11px] leading-snug text-text-muted shadow-sm backdrop-blur-sm md:block',
        className,
      )}
    >
      {children}
    </p>
  );
}

export default function LetterPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background font-sans">
      {/* Faint blueprint grid — matches the app's paper background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            'linear-gradient(to right, var(--border-subtle) 1px, transparent 1px), linear-gradient(to bottom, var(--border-subtle) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />
      {/* A few scattered "aisle" posts */}
      <div aria-hidden className="pointer-events-none absolute left-[8%] top-40 h-24 w-1 rounded bg-accent/10" />
      <div aria-hidden className="pointer-events-none absolute right-[10%] top-[30rem] h-32 w-1 rounded bg-accent/10" />
      <div aria-hidden className="pointer-events-none absolute left-[14%] top-[55rem] h-20 w-1 rounded bg-accent/10" />

      <div className="relative mx-auto max-w-2xl px-4 py-12 sm:px-6 md:py-24">
        {/* Header */}
        <header className="mb-10 flex flex-col items-center gap-4 text-center md:mb-12">
          <Badge
            variant="outline"
            className="max-w-full whitespace-normal gap-1.5 rounded-full px-3 py-1 text-center text-[11px] uppercase leading-snug tracking-[0.18em] text-text-muted sm:text-xs"
          >
            <Warehouse className="size-3.5" aria-hidden />
            A letter to everyone who believed in Taro
          </Badge>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl md:text-4xl">
            Taro is <Highlight>(almost)</Highlight> complete.
          </h1>
          <p className="max-w-md text-sm text-text-muted">
            One last note from the loading dock.
          </p>
        </header>

        {/* The letter, styled like a scanned dispatch note */}
        <article className="relative rounded-xl border border-border-default bg-surface shadow-[0_1px_2px_rgba(17,17,17,0.06)]">
          {/* Torn-top strip */}
          <div
            aria-hidden
            className="absolute -top-3 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 rounded-[2px] border border-b-0 border-l-0 bg-surface"
          />
          <div className="flex flex-col gap-5 p-5 text-[15px] leading-relaxed text-text-primary sm:p-7 md:p-10">
            <p>
              It is difficult to fully describe what this project has become. Looking back at where it
              started, <Highlight>almost everything</Highlight> that I could change, improve, rethink, or
              obsess over has now been completed.
            </p>
            <p>
              And today, I have made a decision that I never expected I would have to make.
            </p>
            <p className="text-base font-medium">
              I am stepping away from Taro.
            </p>
            <p>
              There is something deeply meaningful about doing this on the same day that Tim Cook steps
              down as CEO of Apple. The timing feels appropriate. I am proud that these two events can
              share the same date.
            </p>
            <p>
              Two leaders.
              <br />
              Two transitions.
              <br />
              One warehouse simulation.
            </p>
            <p>
              But more importantly, I want to thank all of you.
            </p>
            <p>
              When I paused Taro, I genuinely did not know whether development would resume. The messages
              you sent, the kind words you shared, and the support you gave me during that period meant
              more than I can properly express.
            </p>
            <p>
              Your support was instrumental in bringing Taro to this point.
            </p>
            <p>
              There were many moments when I questioned whether Taro needed another feature, another
              improvement, another revision, or another <Highlight>completely unnecessary change</Highlight>.
              Your words helped me understand that there eventually comes a point where a project has to be
              allowed to become what it is.
            </p>
            <p>
              And Taro has reached that point.
            </p>
            <p className="text-base font-medium">
              Almost.
            </p>
            <p>
              I am incredibly proud of what I have built. Not because it became everything I imagined, but
              because it became something I could finally look at and say: there is very little left that I
              could reasonably change.
            </p>
            <p>
              That is a feeling I have rarely experienced with anything I have built.
            </p>
            <p>
              So this is not really a goodbye to the work.
            </p>
            <p>
              It is a goodbye to the constant feeling that there is still something left to fix.
            </p>
            <p>
              Thank you for being there through every pause, every return, every decision, and every moment
              when Taro appeared to be approaching completion only to somehow become less complete.
            </p>
            <p>
              I could not have brought it this far without your support.
            </p>
            <p className="text-base font-medium">
              I am stepping away from Taro with a lot of pride, a lot of gratitude, and the feeling that I
              have finally done everything I could.
            </p>
            <p>
              Thank you.
            </p>
            <p className="text-lg font-medium">
              And goodbye, Taro. ❤️😭
            </p>

            {/* Signature block */}
            <div className="mt-2 border-t border-border-subtle pt-6">
              <p className="text-sm text-text-secondary">— Farhan</p>
              <p className="text-xs text-text-muted">
                Signed from the dispatch office, <span className="text-text-secondary">last shift</span>.
              </p>
            </div>
          </div>
        </article>

        {/* Warehouse flair — understated, just enough */}
        <ShelfRow className="mt-10 scale-[0.85] opacity-80 sm:scale-100" />
        <p className="mt-3 text-center text-[11px] uppercase tracking-[0.2em] text-text-muted">
          Aisles cleared · Inventory zeroed · Lights out
        </p>
        <div className="mt-6 flex items-center justify-center gap-2 text-text-muted">
          <MapPin className="size-3.5" aria-hidden />
          <PackageCheck className="size-3.5" aria-hidden />
          <HandHeart className="size-3.5" aria-hidden />
          <PartyPopper className="size-3.5" aria-hidden />
        </div>
      </div>

      {/* Handwritten margin annotations — desktop only */}
      <Annotation className="left-[6%] top-40 rotate-[-3deg]">“the polish was the point”</Annotation>
      <Annotation className="right-[5%] top-[26rem] rotate-[2deg]">sign-off drafted, one last edit… none needed</Annotation>
      <Annotation className="left-[4%] top-[52rem] rotate-[-2deg]">⚑ warehouse quiet — this is the calm part</Annotation>
      <Annotation className="right-[7%] bottom-24 rotate-[-1deg]">pickers off the clock. job done ✅</Annotation>

      {/* Status card — the one thing that *is* empty now */}
        <div className="relative mx-auto -mt-2 max-w-2xl px-4 pb-16 sm:px-6 md:pb-20">
        <div className="rounded-xl border border-dashed border-border-default bg-secondary/50 p-5 text-center sm:p-6">
          <p className="flex items-center justify-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
            <Heart className="size-3.5 text-accent" aria-hidden />
            Status
          </p>
          <p className="mt-3 text-sm text-text-secondary">
            “When I paused Taro… your words helped me understand that there eventually comes a point where a
            project has to be allowed to become what it is.”
          </p>
        </div>
      </div>
    </main>
  );
}
