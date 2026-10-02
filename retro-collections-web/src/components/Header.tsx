import { useCallback, useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { auth } from '../lib/firebase';
import { db } from '../lib/firebase';
import { resolveDataCollectionPath } from '../api/firestore/runtimeConfig';
import { useRequestUserAccessMutation } from '../api/retro-collections/retroCollectionsApi';
import { useIsAdmin } from '../hooks';
import LoginWithGoogle from './LoginWithGoogle';

import { useDispatch } from 'react-redux';
import { clearAuth } from '../store/authSlice';
import retroCollectionsLogo from '../assets/retro-collections-logo.png';

function UserMenu({
  user,
  logout,
  error,
}: {
  user: User;
  logout: () => void;
  error?: string;
}) {
  return (
    <div className="dropdown dropdown-end">
      <button tabIndex={0} className="btn btn-ghost gap-3 px-1 sm:px-3">
        <div className="text-right">
          <p className="text-sm font-medium">
            {user?.displayName || user?.email || 'Guest'}
          </p>
          <p className="text-xs text-base-content/70 whitespace-nowrap">
            {user ? 'Signed in' : 'Not signed in'}
          </p>
        </div>
        <div className="avatar">
          {user?.photoURL ? (
            <div className="w-8 h-8 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2 overflow-hidden">
              <img
                src={user.photoURL}
                alt="avatar"
                className="w-8 h-8 object-cover"
              />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary text-primary-content flex items-center justify-center">
              <span className="text-xs font-semibold">
                {(user?.displayName || user?.email || 'G')
                  .charAt(0)
                  .toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </button>

      <div
        tabIndex={0}
        className="dropdown-content z-10 mt-3 w-80 rounded-box border border-base-300 bg-base-100 p-4 shadow-xl"
      >
        {error && <div className="alert alert-error mb-3">{error}</div>}

        {user ? (
          <div className="space-y-3">
            <div>
              <p className="text-sm text-base-content/70">Signed in as</p>
              <p className="font-semibold">{user.displayName || user.email}</p>
            </div>
            <div className="space-y-1 text-sm text-base-content/80">
              <p>{user.email}</p>
              <p className="break-all">UID: {user.uid}</p>
            </div>

            <NavLink
              to="/profile"
              className="btn btn-ghost w-full justify-start"
            >
              Edit Profile
            </NavLink>

            <button className="btn btn-primary w-full" onClick={logout}>
              Logout
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-base-content/70">
              Sign in to manage your collections and items.
            </p>
            <LoginWithGoogle />
          </div>
        )}
      </div>
    </div>
  );
}

// import { EXPIRY_KEY, TOKEN_KEY } from '../api/google-drive/googleDriveAuth';

type AccessClaims = {
  admin?: boolean;
  enabled?: boolean;
  tester?: boolean;
};

type AccessRequestStatus = 'pending' | 'approved' | 'rejected' | 'unknown';

type ExistingAccessRequest = {
  uid: string;
  email: string;
  message: string;
  status: AccessRequestStatus;
  environment: string;
  createdAt: Date | null;
};

const canAccessMainFromClaims = (claims: AccessClaims) => {
  return (
    claims.admin === true || (claims.enabled === true && claims.tester !== true)
  );
};

const normalizeAccessRequestStatus = (value: unknown): AccessRequestStatus => {
  if (value === 'pending' || value === 'approved' || value === 'rejected') {
    return value;
  }

  return 'unknown';
};

function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [isAccessRequestModalOpen, setIsAccessRequestModalOpen] =
    useState(false);
  const [deniedEmail, setDeniedEmail] = useState('');
  const [accessRequestMessage, setAccessRequestMessage] = useState('');
  const [accessRequestError, setAccessRequestError] = useState('');
  const [accessRequestSuccess, setAccessRequestSuccess] = useState('');
  const [existingAccessRequest, setExistingAccessRequest] =
    useState<ExistingAccessRequest | null>(null);
  const isAdmin = useIsAdmin(user);

  const [requestUserAccess, { isLoading: isRequestingAccess }] =
    useRequestUserAccessMutation();

  const formatAccessRequestDate = (date: Date | null) => {
    if (!date) {
      return 'Not available yet';
    }

    return date.toLocaleString();
  };

  const readExistingAccessRequest = useCallback(
    async (uid: string): Promise<ExistingAccessRequest | null> => {
      const requestsPath = await resolveDataCollectionPath({
        visibility: 'private',
        resourceType: 'users-access-requests',
      });
      const requestRef = doc(db, requestsPath, uid);
      const requestSnap = await getDoc(requestRef);

      if (!requestSnap.exists()) {
        setExistingAccessRequest(null);
        return null;
      }

      const data = requestSnap.data() as {
        uid?: string;
        email?: string;
        message?: string;
        status?: string;
        environment?: string;
        createdAt?: Timestamp | null;
      };

      const parsedRequest: ExistingAccessRequest = {
        uid: data.uid || uid,
        email: data.email || '',
        message: data.message || '',
        status: normalizeAccessRequestStatus(data.status),
        environment: data.environment || '',
        createdAt:
          data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
      };

      setExistingAccessRequest(parsedRequest);
      return parsedRequest;
    },
    []
  );

  const closeAccessRequestModal = () => {
    setIsAccessRequestModalOpen(false);
    setExistingAccessRequest(null);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (!currentUser) {
        setIsAccessRequestModalOpen(false);
        setExistingAccessRequest(null);
        return;
      }

      try {
        const tokenResult = await currentUser.getIdTokenResult(true);
        const claims = tokenResult.claims as AccessClaims;
        const hasMainAccess = canAccessMainFromClaims(claims);

        if (!hasMainAccess) {
          setDeniedEmail(currentUser.email || '');
          setAccessRequestError('');
          setAccessRequestSuccess('');
          try {
            const existingRequest = await readExistingAccessRequest(
              currentUser.uid
            );
            setIsAccessRequestModalOpen(!existingRequest);
          } catch (readError) {
            console.error(
              'Failed to read existing access request on auth restore:',
              readError
            );
            setExistingAccessRequest(null);
            setIsAccessRequestModalOpen(true);
          }
        } else {
          closeAccessRequestModal();
        }
      } catch (authStateError) {
        console.error('Failed to evaluate access status:', authStateError);
      }
    });

    return unsubscribe;
  }, [readExistingAccessRequest]);

  const logout = async () => {
    try {
      await signOut(auth);
      dispatch(clearAuth());
      setError('');
    } catch (logoutError) {
      console.error('Logout error:', logoutError);
    }
  };

  const submitAccessRequest = async () => {
    try {
      setAccessRequestError('');
      setAccessRequestSuccess('');

      const response = await requestUserAccess({
        message: accessRequestMessage.trim(),
      }).unwrap();

      setAccessRequestSuccess(
        response.message ||
          'Your request has been sent. An administrator will review it soon.'
      );

      if (auth.currentUser) {
        try {
          await readExistingAccessRequest(auth.currentUser.uid);
        } catch (readError) {
          // Request was already submitted successfully; this follow-up read should not surface as a submit failure.
          console.error(
            'Failed to refresh access request after submit:',
            readError
          );
        }
      }

      closeAccessRequestModal();
      navigate('/my-collectibles');
    } catch (requestError: unknown) {
      const err = requestError as {
        data?: { error?: string };
        error?: string;
      };
      setAccessRequestError(
        err?.data?.error ||
          err?.error ||
          'Failed to submit access request. Please try again.'
      );
    }
  };

  const navTabClassName = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? 'tab tab-active font-qwigley header-nav-glow !text-3xl !leading-none'
      : 'tab font-qwigley header-nav-glow !text-3xl !leading-none';

  // console.log('Current user in Header:', user);

  return (
    // <header className="rounded-box border border-base-300 bg-base-100 shadow-sm">
    <header className="mb-0">
      {isAccessRequestModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-base-300 bg-base-100 p-6 shadow-xl">
            <h3 className="text-xl font-semibold">Access Request Required</h3>
            <p className="mt-2 text-sm text-base-content/70">
              Access denied. User {deniedEmail || user?.email || 'unknown'} is
              not authorized.
            </p>
            <p className="mt-2 text-sm text-base-content/70">
              You can send a request to the administrator from here.
            </p>

            {existingAccessRequest ? (
              <div className="mt-4 space-y-2 rounded-lg border border-base-300 bg-base-200/50 p-4 text-sm">
                <p>
                  <span className="font-semibold">Request status:</span>{' '}
                  <span className="capitalize">
                    {existingAccessRequest.status}
                  </span>
                </p>
                <p>
                  <span className="font-semibold">Submitted at:</span>{' '}
                  {formatAccessRequestDate(existingAccessRequest.createdAt)}
                </p>
                {existingAccessRequest.environment && (
                  <p>
                    <span className="font-semibold">Environment:</span>{' '}
                    {existingAccessRequest.environment}
                  </p>
                )}
                {existingAccessRequest.message && (
                  <p>
                    <span className="font-semibold">Your message:</span>{' '}
                    {existingAccessRequest.message}
                  </p>
                )}
              </div>
            ) : (
              <label className="form-control mt-4 w-full">
                <span className="label-text mb-2 text-sm">
                  Message (optional)
                </span>
                <textarea
                  className="textarea textarea-bordered min-h-[120px] w-full"
                  maxLength={500}
                  value={accessRequestMessage}
                  onChange={(event) =>
                    setAccessRequestMessage(event.target.value)
                  }
                  placeholder="Add context for your request (max 500 characters)"
                />
              </label>
            )}

            {accessRequestError && (
              <div className="alert alert-error mt-4">{accessRequestError}</div>
            )}
            {accessRequestSuccess && (
              <div className="alert alert-success mt-4">
                {accessRequestSuccess}
              </div>
            )}

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn btn-primary"
                onClick={submitAccessRequest}
                disabled={
                  isRequestingAccess ||
                  !!accessRequestSuccess ||
                  !!existingAccessRequest
                }
              >
                {isRequestingAccess ? 'Sending Request...' : 'Request Access'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={async () => {
                  closeAccessRequestModal();
                  await logout();
                }}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="navbar p-0 mb-4">
        <div className="flex flex-col lg:flex-row items-start gap-3 lg:items-center mr-0 w-full">
          <div className="flex items-center gap-2 w-full md:w-auto">
            <img
              src={retroCollectionsLogo}
              alt="Retro Collections"
              className="h-18 w-auto mb-2 ml-0 mt-2 mr-4"
            />
            {/* <p className="text-sm text-base-content/70 mb-2 ml-2">
              Organize, tag, and share your retro collections. Manage
              collectibles, track items, customize tags, and control visibility.
            </p> */}
            <div className="block md:hidden ml-auto mr-2">
              <UserMenu user={user as User} logout={logout} error={error} />
            </div>
          </div>

          {/* Mobile: select dropdown navigation */}
          <div className="header-nav-picker relative w-full max-w-md lg:hidden">
            <select
              className="select w-full max-w-md font-qwigley header-nav-glow text-3xl leading-none !border-0 !shadow-none focus:!border-0 focus:!shadow-none focus-visible:!border-0 focus-visible:!shadow-none !outline-none focus:!outline-none focus-visible:!outline-none"
              value={(() => {
                if (location.pathname.startsWith('/my-collectibles'))
                  return '/my-collectibles';
                if (location.pathname.startsWith('/my-collections'))
                  return '/my-collections';
                if (location.pathname.startsWith('/my-wishlists'))
                  return '/my-wishlists';
                if (location.pathname.startsWith('/tags')) return '/tags';
                if (location.pathname.startsWith('/collectors'))
                  return '/collectors';
                if (location.pathname.startsWith('/settings'))
                  return '/settings';
                if (isAdmin && location.pathname.startsWith('/users'))
                  return '/users';
                if (isAdmin && location.pathname.startsWith('/admin'))
                  return '/admin';
                return '/my-collections';
              })()}
              onChange={(e) => navigate(e.target.value)}
            >
              <option value="/my-collectibles">My Collectibles</option>
              <option value="/my-collections">My Collections</option>
              <option value="/my-wishlists">My Wishlists</option>
              <option value="/collectors">Collectors</option>
              <option value="/tags">Tags</option>
              <option value="/settings">Settings</option>
              {isAdmin && <option value="/users">Users</option>}
              {isAdmin && <option value="/admin">Admin</option>}
            </select>
          </div>

          {/* Desktop: tab navigation */}
          <nav className="tabs tabs-boxed flex-wrap gap-2 hidden lg:flex">
            <NavLink to="/my-collectibles" className={navTabClassName}>
              My Collectibles
            </NavLink>
            <NavLink to="/my-collections" className={navTabClassName}>
              My Collections
            </NavLink>
            <NavLink to="/my-wishlists" className={navTabClassName}>
              My Wishlists
            </NavLink>
            <NavLink to="/collectors" className={navTabClassName}>
              Collectors
            </NavLink>
            <NavLink to="/tags" className={navTabClassName}>
              Tags
            </NavLink>

            <NavLink to="/settings" className={navTabClassName}>
              Settings
            </NavLink>
            {isAdmin && (
              <NavLink to="/users" className={navTabClassName}>
                Users
              </NavLink>
            )}
            {isAdmin && (
              <NavLink to="/admin" className={navTabClassName}>
                Admin
              </NavLink>
            )}
          </nav>
          <div className="hidden md:block ml-auto mr-2">
            <UserMenu user={user as User} logout={logout} error={error} />
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
