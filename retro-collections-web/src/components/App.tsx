import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import AdminPage from '../pages/AdminPage';
import SettingsPage from '../pages/SettingsPage';
import CollectorPage from '../pages/CollectorPage';
import CollectorsPage from '../pages/CollectorsPage';
import UsersPage from '../pages/UsersPage';
import MyCollectionsPage from '../pages/MyCollectionsPage';
import MyWishlistsPage from '../pages/MyWishlistsPage';
import ProfilePage from '../pages/ProfilePage';
import TagsPage from '../pages/TagsPage';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { auth } from '../lib/firebase';
import { db } from '../lib/firebase';
import { useGetRuntimeConfigQuery } from '../api/firestore/firestoreApi';
import { resolveDataCollectionPath } from '../api/firestore/runtimeConfig';
import { useGoogleDriveAuth } from '../utils/hooks';
import MyCollectiblesPage from '../pages/MyCollectiblesPage';
import LoginWithGoogle from './LoginWithGoogle';
import UploadQueueIndicator from './UploadQueueIndicator';
import SynthwaveBackground from './SynthwaveBackground';
import { useAnimatedBackground } from '../utils/backgroundPreference';
import { uploadQueue } from '../api/google-drive/uploadQueue';
import { useCurrentUser } from '../utils/hooks';

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

const normalizeAccessRequestStatus = (value: unknown): AccessRequestStatus => {
  if (value === 'pending' || value === 'approved' || value === 'rejected') {
    return value;
  }

  return 'unknown';
};

const formatAccessRequestDate = (date: Date | null) => {
  if (!date) {
    return 'Not available yet';
  }

  return date.toLocaleString();
};

function canAccessMainFromClaims(claims: AccessClaims) {
  return (
    claims.admin === true || (claims.enabled === true && claims.tester !== true)
  );
}

function App() {
  useGoogleDriveAuth();
  const currentUser = useCurrentUser();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthorizedForMain, setIsAuthorizedForMain] = useState(false);
  const [isAuthResolved, setIsAuthResolved] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [existingAccessRequest, setExistingAccessRequest] =
    useState<ExistingAccessRequest | null>(null);
  const { isLoading: isRuntimeConfigLoading, isError: isRuntimeConfigError } =
    useGetRuntimeConfigQuery(undefined, {
      skip: !isAuthenticated || !isAuthorizedForMain || !isAuthResolved,
    });

  const animatedBackground = useAnimatedBackground();
  const shellBackground = animatedBackground
    ? 'relative z-10 bg-transparent'
    : 'bg-base-200';
  const currentUserId = currentUser?.uid;
  useEffect(() => {
    // Background Drive uploads are queued per user and resume after reloads.
    if (currentUserId) {
      void uploadQueue.start(currentUserId);
    } else {
      uploadQueue.stop();
    }
  }, [currentUserId]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (!currentUser) {
        setIsAuthenticated(false);
        setIsAuthorizedForMain(false);
        setIsAuthResolved(true);
        return;
      }

      setIsAuthenticated(true);
      setIsAuthResolved(false);

      try {
        const tokenResult = await currentUser.getIdTokenResult(true);
        const claims = tokenResult.claims as AccessClaims;
        setIsAuthorizedForMain(canAccessMainFromClaims(claims));
      } catch {
        setIsAuthorizedForMain(false);
      } finally {
        setIsAuthResolved(true);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isAuthenticated || isAuthorizedForMain || !user) {
      return;
    }

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      try {
        const requestsPath = await resolveDataCollectionPath({
          visibility: 'private',
          resourceType: 'users-access-requests',
        });
        if (cancelled) {
          return;
        }

        const requestRef = doc(db, requestsPath, user.uid);
        unsubscribe = onSnapshot(
          requestRef,
          (snapshot) => {
            if (!snapshot.exists()) {
              setExistingAccessRequest(null);
              return;
            }

            const data = snapshot.data() as {
              uid?: string;
              email?: string;
              message?: string;
              status?: string;
              environment?: string;
              createdAt?: Timestamp | null;
            };

            setExistingAccessRequest({
              uid: data.uid || user.uid,
              email: data.email || user.email || '',
              message: data.message || '',
              status: normalizeAccessRequestStatus(data.status),
              environment: data.environment || '',
              createdAt:
                data.createdAt instanceof Timestamp
                  ? data.createdAt.toDate()
                  : null,
            });
          },
          (error) => {
            console.error('Failed to read access request status:', error);
          }
        );
      } catch (error) {
        console.error('Failed to resolve access requests path:', error);
      }
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [isAuthenticated, isAuthorizedForMain, user]);

  if (isAuthenticated && !isAuthResolved) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base-200 text-base-content">
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <span className="loading loading-spinner loading-lg" />
            <p>Checking account access...</p>
          </div>
        </div>
      </div>
    );
  }

  if (isAuthenticated && isAuthorizedForMain && isRuntimeConfigLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base-200 text-base-content">
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <span className="loading loading-spinner loading-lg" />
            <p>Loading config...</p>
          </div>
        </div>
      </div>
    );
  }

  if (isAuthenticated && isAuthorizedForMain && isRuntimeConfigError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base-200 text-base-content">
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Config unavailable</h2>
            <p>
              Please try again after the public runtime config is reachable.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <HashRouter>
        <SynthwaveBackground />
        <div
          className={`flex flex-col min-h-screen text-base-content ${shellBackground}`}
        >
          <div className="flex-1">
            <div className="mx-auto max-w-screen-2xl space-y-4 px-2 sm:px-4 py-8">
              <Header />
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  {/* <h2 className="card-title">My Profile</h2> */}
                  <p>Please log in to view and edit your profile.</p>
                  <LoginWithGoogle className="btn btn-primary max-w-xs" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </HashRouter>
    );
  }
  console.log('Current user:', currentUser);
  return (
    <HashRouter>
      <SynthwaveBackground />
      <div
        className={`flex flex-col min-h-screen text-base-content ${shellBackground}`}
      >
        <div className="flex-1">
          <div className="mx-auto max-w-screen-2xl space-y-4 px-2 sm:px-4 py-8">
            <Header />

            {!isAuthenticated || isAuthorizedForMain ? (
              <div className="space-y-6">
                <Routes>
                  <Route
                    path="/*"
                    element={<Navigate to="/my-collectibles" />}
                  />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route
                    path="/my-collectibles/*"
                    element={<MyCollectiblesPage />}
                  />
                  <Route
                    path="/my-collections/*"
                    element={<MyCollectionsPage />}
                  />
                  <Route path="/my-wishlists/*" element={<MyWishlistsPage />} />
                  <Route
                    path="/collectors/:userId/*"
                    element={<CollectorPage />}
                  />
                  <Route path="/collectors" element={<CollectorsPage />} />
                  <Route path="/users" element={<UsersPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/admin" element={<AdminPage />} />
                  <Route path="/tags" element={<TagsPage user={user} />} />
                </Routes>
              </div>
            ) : (
              <div className="rounded-box border border-base-300 bg-base-100 p-6 shadow-sm">
                <h2 className="text-lg font-semibold">Access pending</h2>
                <p className="mt-2 text-sm text-base-content/70">
                  Your account is signed in, but not authorized yet. Use the
                  access request dialog in the header to submit or review your
                  request.
                </p>

                {existingAccessRequest && (
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
                    {existingAccessRequest.email && (
                      <p>
                        <span className="font-semibold">Email:</span>{' '}
                        {existingAccessRequest.email}
                      </p>
                    )}
                    {existingAccessRequest.environment && (
                      <p>
                        <span className="font-semibold">Environment:</span>{' '}
                        {existingAccessRequest.environment}
                      </p>
                    )}
                    {existingAccessRequest.message && (
                      <p>
                        <span className="font-semibold">Message:</span>{' '}
                        {existingAccessRequest.message}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <Footer />
        {isAuthorizedForMain && <UploadQueueIndicator />}
      </div>
    </HashRouter>
  );
}

export default App;
