import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
  type PanInfo,
} from 'framer-motion';

export interface SwipeNavItem {
  value: string;
  label: string;
}

interface SwipeNavProps {
  items: SwipeNavItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  labelClassName?: string;
}

/** Space between labels, as a share of the bar width (with a minimum). */
const GAP_RATIO = 0.12;
const MIN_GAP_PX = 28;
/** Drag past this share of the distance to a neighbour (or flick) to move. */
const SWIPE_THRESHOLD = 0.3;
const FLICK_VELOCITY = 450;
const NEIGHBOUR_OPACITY = 0.55;
/** Neighbours are drawn smaller and grow as they slide to the middle. */
const NEIGHBOUR_SCALE = 0.8;
const SPRING = { type: 'spring', stiffness: 380, damping: 38 } as const;
const EDGE_FADE =
  'linear-gradient(to right, rgb(0 0 0 / 0.5), black 18%, black 82%, rgb(0 0 0 / 0.5))';

interface Layout {
  width: number;
  /** Centre of each label within the strip, in px. */
  centers: number[];
  /** Typical distance between neighbouring label centres. */
  step: number;
}

/**
 * Mobile section switcher: all section names sit in one strip that slides
 * so the current one is centred, with its neighbours peeking at the edges.
 * Swipe the bar or tap a neighbour to move; tap the middle name to open the
 * full list (native select).
 */
export default function SwipeNav({
  items,
  value,
  onChange,
  className = '',
  labelClassName = '',
}: SwipeNavProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const [layout, setLayout] = useState<Layout | null>(null);
  const layoutRef = useRef<Layout | null>(null);
  const [gap, setGap] = useState(MIN_GAP_PX);
  const x = useMotionValue(0);
  const reduceMotion = useReducedMotion();
  const draggedRef = useRef(false);
  const animatingToRef = useRef<number | null>(null);
  const shownIndexRef = useRef<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the section menu on an outside tap or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const handlePointer = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  const index = Math.max(
    0,
    items.findIndex((item) => item.value === value)
  );

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const width = container.clientWidth;
    const centers = items.map((_, i) => {
      const element = itemRefs.current[i];
      return element ? element.offsetLeft + element.offsetWidth / 2 : 0;
    });
    const steps = centers.slice(1).map((center, i) => center - centers[i]);
    const step =
      steps.length > 0
        ? steps.reduce((sum, distance) => sum + distance, 0) / steps.length
        : width;
    const next = { width, centers, step: Math.max(1, step) };
    layoutRef.current = next;
    setLayout(next);
    setGap(Math.max(MIN_GAP_PX, width * GAP_RATIO));
  }, [items]);

  // Re-measure when the bar resizes, the labels change, or the script font
  // finishes loading (it changes every label's width).
  useLayoutEffect(() => {
    measure();
    const observer = new ResizeObserver(() => measure());
    if (containerRef.current) observer.observe(containerRef.current);
    itemRefs.current.forEach((element) => element && observer.observe(element));
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [measure, gap]);

  // Keep the current section centred: animate when it changes, jump when
  // only the measurements changed.
  useLayoutEffect(() => {
    if (!layout) return;
    const target = targetFor(index, layout);
    const indexChanged =
      shownIndexRef.current !== null && shownIndexRef.current !== index;
    shownIndexRef.current = index;

    if (animatingToRef.current === target) return;
    if (indexChanged && !reduceMotion) {
      animatingToRef.current = target;
      void animate(x, target, SPRING).then(() => {
        animatingToRef.current = null;
      });
    } else {
      x.set(target);
    }
  }, [index, layout, reduceMotion, x]);

  const goTo = (nextIndex: number) => {
    const current = layoutRef.current;
    if (!current) return;
    const clamped = Math.min(items.length - 1, Math.max(0, nextIndex));
    const target = targetFor(clamped, current);

    if (reduceMotion) {
      x.set(target);
    } else {
      animatingToRef.current = target;
      void animate(x, target, SPRING).then(() => {
        animatingToRef.current = null;
      });
    }
    if (clamped !== index) {
      shownIndexRef.current = clamped;
      onChange(items[clamped].value);
    }
  };

  const handleDragEnd = (_event: unknown, info: PanInfo) => {
    const current = layoutRef.current;
    if (current) {
      // The name closest to the middle when the finger lifts wins, so a long
      // drag can skip several sections.
      const middle = current.width / 2 - x.get();
      const nearest = current.centers.reduce(
        (best, center, i) =>
          Math.abs(center - middle) < Math.abs(current.centers[best] - middle)
            ? i
            : best,
        index
      );

      if (nearest !== index) {
        goTo(nearest);
      } else {
        // Still nearest to where it started: a short drag past the
        // threshold, or a flick, moves one section; otherwise spring back.
        const moved = targetFor(index, current) - x.get();
        const share = moved / current.step;
        if (share > SWIPE_THRESHOLD || info.velocity.x < -FLICK_VELOCITY) {
          goTo(index + 1);
        } else if (
          share < -SWIPE_THRESHOLD ||
          info.velocity.x > FLICK_VELOCITY
        ) {
          goTo(index - 1);
        } else {
          goTo(index);
        }
      }
    }
    // The pointerup that ends a drag also fires a click; ignore that one.
    window.setTimeout(() => {
      draggedRef.current = false;
    }, 0);
  };

  const dragBounds = layout
    ? {
        left: targetFor(items.length - 1, layout),
        right: targetFor(0, layout),
      }
    : { left: 0, right: 0 };

  return (
    <div ref={wrapperRef} className={`relative z-40 ${className}`}>
      <nav
        ref={containerRef}
        aria-label="Sections"
        className="relative h-full w-full overflow-hidden rounded-[inherit] select-none"
      >
        {/* Fade the edges so neighbouring sections read as "peeking"; the
          mask sits on this layer so the bar's own background and glow stay. */}
        <div
          className="absolute inset-0"
          style={{
            maskImage: EDGE_FADE,
            WebkitMaskImage: EDGE_FADE,
            // Hidden until measured, so nothing flashes in the wrong place.
            visibility: layout ? 'visible' : 'hidden',
          }}
        >
          <motion.div
            className={`absolute inset-y-0 left-0 flex items-center touch-pan-y whitespace-nowrap ${labelClassName}`}
            style={{ x, columnGap: gap }}
            drag="x"
            dragConstraints={dragBounds}
            dragElastic={0.2}
            dragMomentum={false}
            onDragStart={() => {
              draggedRef.current = true;
              setMenuOpen(false);
            }}
            onDragEnd={handleDragEnd}
          >
            {items.map((item, i) => (
              <StripLabel
                key={item.value}
                elementRef={(element) => {
                  itemRefs.current[i] = element;
                }}
                item={item}
                itemIndex={i}
                isCurrent={i === index}
                x={x}
                layoutRef={layoutRef}
                menuOpen={menuOpen}
                onSelect={() => {
                  // A drag also ends with a click; only real taps count.
                  if (draggedRef.current) return;
                  if (i === index) setMenuOpen((open) => !open);
                  else goTo(i);
                }}
              />
            ))}
          </motion.div>
        </div>
      </nav>

      {/* Full section list, opened by tapping the current name. A custom menu
        rather than a native <select>, which would swallow swipes that start
        on the name. The wrapper's z-40 keeps it above the page content: the
        glass effect makes the wrapper its own stacking layer. */}
      {menuOpen && (
        <ul
          role="listbox"
          aria-label="Sections"
          className="dropdown-content menu rounded-box bg-base-100 absolute inset-x-0 top-full z-50 mt-2 w-full p-2 shadow-xl"
          // Solid: the bar's glass blur can't extend to a menu nested inside
          // it, so a see-through menu would show the page text behind it.
          style={{ backgroundColor: 'var(--color-base-100)' }}
        >
          {items.map((item, i) => (
            <li key={item.value}>
              <button
                type="button"
                role="option"
                aria-selected={i === index}
                className={i === index ? 'menu-active' : undefined}
                onClick={() => {
                  setMenuOpen(false);
                  if (i !== index) goTo(i);
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const targetFor = (i: number, layout: Layout) =>
  layout.width / 2 - layout.centers[i];

interface StripLabelProps {
  elementRef: (element: HTMLElement | null) => void;
  item: SwipeNavItem;
  itemIndex: number;
  isCurrent: boolean;
  x: MotionValue<number>;
  layoutRef: React.RefObject<Layout | null>;
  menuOpen: boolean;
  onSelect: () => void;
}

/**
 * One section name. Its brightness and size come from its live distance to
 * the middle of the bar: full at the centre, dimmer and smaller as a
 * neighbour, invisible further out, so names fade in instead of popping.
 */
function StripLabel({
  elementRef,
  item,
  itemIndex,
  isCurrent,
  x,
  layoutRef,
  menuOpen,
  onSelect,
}: StripLabelProps) {
  const closeness = (offset: number) => {
    const layout = layoutRef.current;
    if (!layout) return isCurrent ? 1 : 0;
    const { centers } = layout;
    const distance = centers[itemIndex] + offset - layout.width / 2;
    // Measure against the gap to the next name towards the middle, so every
    // neighbour rests at exactly the same brightness/size whatever its length.
    const inward =
      distance > 0
        ? centers[itemIndex] - (centers[itemIndex - 1] ?? NaN)
        : (centers[itemIndex + 1] ?? NaN) - centers[itemIndex];
    const step = Number.isFinite(inward) && inward > 0 ? inward : layout.step;
    return 1 - Math.abs(distance) / step;
  };
  const opacity = useTransform(x, (offset) => fade(closeness(offset)));
  const scale = useTransform(x, (offset) => grow(closeness(offset)));

  // Every name renders the same way (▾ included, shown only on the current
  // one) so widths, and therefore positions, don't change when it switches.
  return (
    <motion.span
      ref={elementRef}
      role="button"
      aria-label={
        isCurrent ? `${item.label}: choose a section` : `Go to ${item.label}`
      }
      aria-haspopup={isCurrent ? 'listbox' : undefined}
      aria-expanded={isCurrent ? menuOpen : undefined}
      className="relative inline-flex cursor-pointer items-center gap-1.5"
      style={{ opacity, scale }}
      onClick={onSelect}
    >
      <span>{item.label}</span>
      <span
        aria-hidden="true"
        className={`text-xs transition-opacity ${isCurrent ? 'opacity-60' : 'opacity-0'}`}
      >
        ▾
      </span>
    </motion.span>
  );
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Closeness is 1 at the centre, 0 one step away (a neighbour) and negative
 * beyond: neighbours sit at NEIGHBOUR_OPACITY and anything further fades out.
 */
const fade = (closeness: number) =>
  closeness >= 0
    ? NEIGHBOUR_OPACITY + (1 - NEIGHBOUR_OPACITY) * clamp01(closeness)
    : NEIGHBOUR_OPACITY * clamp01(1 + closeness * 2);

const grow = (closeness: number) =>
  NEIGHBOUR_SCALE + (1 - NEIGHBOUR_SCALE) * clamp01(closeness);
