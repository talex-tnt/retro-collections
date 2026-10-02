import { useState, useRef, useEffect } from 'react';
import { FiEye, FiEyeOff, FiChevronDown } from 'react-icons/fi';
import type { Wishlist } from '../api/firestore/services/misc/userWishlists';

interface BreadcrumbProps {
  visibility: 'public' | 'private';
  currentWishlistId: string | null;
  wishlists: Wishlist[];
  onVisibilityChange: (newVis: 'public' | 'private') => void;
  onNavigate: (path: string) => void;
}

function MyWishesBreadcrumb({
  visibility,
  currentWishlistId,
  wishlists,
  onVisibilityChange,
  onNavigate,
}: BreadcrumbProps) {
  const currentWishlist = wishlists.find((c) => c.id === currentWishlistId);

  const visibilityColor =
    visibility === 'public' ? 'text-primary' : 'text-secondary';
  const tabColor = 'text-primary';
  const tertiaryColor = 'text-accent';

  const [openDropdown, setOpenDropdown] = useState<
    'visibility' | 'wishlist' | null
  >(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const toggleDropdown = (menu: 'visibility' | 'wishlist') => {
    setOpenDropdown((prev) => (prev === menu ? null : menu));
  };

  const handleAction = (callback: () => void) => {
    setOpenDropdown(null);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    callback();
  };

  return (
    <div
      ref={containerRef}
      className="mb-3 bg-base-200 p-4 pt-2 px-2 rounded-xl text-sm breadcrumbs overflow-visible"
    >
      <ul className="flex-wrap row-gap-1">
        <li className="whitespace-normal">
          <div className="flex items-center gap-1">
            <button
              onClick={() =>
                onVisibilityChange(
                  visibility === 'public' ? 'private' : 'public'
                )
              }
              className={`link font-bold capitalize flex items-center gap-1.5 no-underline hover:no-underline bg-transparent border-none p-0 min-h-0 h-auto ${visibilityColor}`}
            >
              {visibility === 'public' ? (
                <FiEye className="h-4 w-4" />
              ) : (
                <FiEyeOff className="h-4 w-4" />
              )}
              {visibility}
            </button>

            <div
              className={`dropdown dropdown-bottom ${openDropdown === 'visibility' ? 'dropdown-open' : ''}`}
            >
              <button
                onClick={() => toggleDropdown('visibility')}
                className={`btn btn-ghost btn-xs p-0 min-h-0 h-5 w-3 rounded ${visibilityColor}`}
              >
                <FiChevronDown className="h-3 w-3" />
              </button>
              <ul className="dropdown-content z-[50] menu p-2 shadow bg-base-100 rounded-box w-32 mt-2">
                <li>
                  <button
                    onClick={() =>
                      handleAction(() => onVisibilityChange('public'))
                    }
                    className="flex items-center gap-2 text-primary font-medium"
                  >
                    <FiEye className="h-3.5 w-3.5" /> Public
                  </button>
                </li>
                <li>
                  <button
                    onClick={() =>
                      handleAction(() => onVisibilityChange('private'))
                    }
                    className="flex items-center gap-2 text-secondary font-medium"
                  >
                    <FiEyeOff className="h-3.5 w-3.5" /> Private
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </li>

        <li className="whitespace-normal">
          <div className="flex items-center gap-1 hover:no-underline">
            <span
              className={`font-bold capitalize select-none cursor-default ${tabColor} hover:no-underline`}
            >
              Wishlists
            </span>
          </div>
        </li>

        {currentWishlistId && (
          <li className="whitespace-normal">
            <div className="flex items-center gap-1">
              <span
                className={`font-bold inline-block text-left select-none cursor-default ${tertiaryColor}`}
                title={currentWishlist?.name}
              >
                {currentWishlist?.name || 'Loading...'}
              </span>

              <div
                className={`dropdown dropdown-end ${openDropdown === 'wishlist' ? 'dropdown-open' : ''}`}
              >
                <button
                  onClick={() => toggleDropdown('wishlist')}
                  className={`btn btn-ghost btn-xs p-0 min-h-0 h-5 w-3 rounded ${tertiaryColor}`}
                >
                  <FiChevronDown className="h-3 w-3" />
                </button>
                <ul className="dropdown-content z-[50] menu p-2 shadow bg-base-100 rounded-box w-56 max-h-60 overflow-y-auto mt-2">
                  <li className="menu-title text-xs opacity-50">
                    Switch Wishlist
                  </li>
                  {wishlists.map((col) => (
                    <li key={col.id}>
                      <button
                        className={
                          col.id === currentWishlistId
                            ? 'bg-accent/10 text-accent font-bold'
                            : ''
                        }
                        onClick={() =>
                          handleAction(() =>
                            onNavigate(
                              `/my-wishlists/${visibility}/wishlists/${col.id}`
                            )
                          )
                        }
                      >
                        {col.name}
                      </button>
                    </li>
                  ))}
                  {wishlists.length === 0 && (
                    <li className="disabled text-xs p-2 italic">
                      No other wishlists
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </li>
        )}
      </ul>
    </div>
  );
}

export default MyWishesBreadcrumb;
