import { useEffect, useState } from 'react';
import { getIsAdmin } from '../lib/firebase';
export * from './useBulkItemActions';

export const useIsAdmin = (user: unknown) => {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    getIsAdmin().then(setIsAdmin);
  }, [user]);

  return isAdmin;
};
export * from './useAISettings';
