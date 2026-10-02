import { getRelativeTimeString } from '../utils';

declare const __BUILD_DATE__: string;
declare const __GIT_HASH__: string;

function Footer() {
  const buildDateObject = new Date(__BUILD_DATE__);

  const buildDate = buildDateObject.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const relativeTime = getRelativeTimeString(buildDateObject);

  return (
    <footer className="border-t border-base-300 bg-base-100 px-4 py-2 text-center text-xs text-base-content/60 sm:py-4 sm:text-sm">
      {/* One short line on phones; the full build details on wider screens. */}
      <p className="truncate">
        <span className="sm:hidden">Built {relativeTime} · </span>
        <span className="hidden sm:inline">
          Build: {buildDate} ({relativeTime}) | Commit:{' '}
        </span>
        <code className="font-mono">{__GIT_HASH__}</code>
      </p>
    </footer>
  );
}

export default Footer;
