import React, { useEffect, useState } from 'react';
import { useUISettings } from '../utils/hooks';
import { useQueuedImageUrl } from '../api/google-drive/uploadQueue';

interface PreviewImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  driveId?: string;
  size?: 'w25' | 'w50' | 'w100' | 'w200' | 'w300' | 'w400' | 'w800' | 'w1600';
  fallbackUrl?: string;
}

export const PreviewImage: React.FC<PreviewImageProps> = ({
  driveId,
  size: sz,
  fallbackUrl = 'https://placehold.co/200x200?text=No+Image',
  className = '',
  alt = 'Preview',
  ...props
}) => {
  const [settings] = useUISettings();
  const desktopSize = settings?.desktopPreviewImageSize;
  const mobileSize = settings?.mobilePreviewImageSize;
  const [isDesktop, setIsDesktop] = useState<boolean>(false);
  const settingsSize = isDesktop ? desktopSize : mobileSize;

  const size = sz ? sz : settingsSize ? `w${settingsSize}` : undefined;

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const [uiSettings] = useUISettings();
  const enableProxy = uiSettings?.enableImageProxy ?? true;
  // Photos still in the background upload queue are shown from memory.
  const queuedUrl = useQueuedImageUrl(driveId);

  // console.log(
  //   'Using image size:',
  //   size,
  //   'for device type:',
  //   isDesktop ? 'Desktop' : 'Mobile'
  // );
  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 768px)');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDesktop(mediaQuery.matches);

    const handleResize = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mediaQuery.addEventListener('change', handleResize);

    return () => mediaQuery.removeEventListener('change', handleResize);
  }, []);

  if (queuedUrl) {
    return <img src={queuedUrl} alt={alt} className={className} {...props} />;
  }

  // If there's no ID, immediately default to the fallback
  if (!driveId) {
    return <img src={fallbackUrl} alt={alt} className={className} {...props} />;
  }

  // Construct the Vercel proxy URL
  const proxyUrl = enableProxy
    ? `${import.meta.env.VITE_RETRO_COLLECTIONS_BASEURL}/drive-proxy?id=${driveId}&sz=${size}`
    : `https://drive.google.com/thumbnail?id=${driveId}&sz=${size}`;

  if (!size) {
    return;
  }
  return (
    <div className={`relative inline-block ${className}`}>
      {/* Loading Spinner Overlaid */}
      {(!size || loading) && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded animate-pulse">
          <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}

      {/* The Actual Image */}
      {size && (
        <img
          src={error ? fallbackUrl : proxyUrl}
          crossOrigin="anonymous"
          alt={alt}
          loading="lazy"
          onLoad={() => setLoading(false)}
          onError={() => {
            setError(true);
            setLoading(false);
          }}
          className={`w-full h-auto object-cover transition-opacity duration-300 ${
            loading ? 'opacity-0' : 'opacity-100'
          }`}
          {...props}
        />
      )}
    </div>
  );
};
