import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import type { Session } from '@supabase/supabase-js';

import {
  supabase,
  type Profile,
  type UserRole,
} from '@/lib/supabase';

import {
  hasPMSAccess,
  type PMSSubscription,
} from '@/lib/PMSAccess';


// ============================================================
// AUTH CONTEXT TYPE
// ============================================================

interface AuthContextValue {
  // ----------------------------------------------------------
  // AUTH
  // ----------------------------------------------------------

  session: Session | null;

  profile: Profile | null;

  loading: boolean;

  needsRoleSelection: boolean;


  // ----------------------------------------------------------
  // PMS SUBSCRIPTION
  // ----------------------------------------------------------

  subscription: PMSSubscription | null;

  /**
   * True when the current user has valid PMS access.
   *
   * Valid:
   * - active
   * - trial
   *
   * And:
   * - plan must not be free
   * - subscription must not be expired
   *
   * Invalid:
   * - null
   * - pending
   * - cancelled
   * - expired
   * - free plan
   */
  hasActivePMS: boolean;


  // ----------------------------------------------------------
  // AUTH ACTIONS
  // ----------------------------------------------------------

  signUp: (
    email: string,
    password: string,
    fullName: string
  ) => Promise<{
    error: string | null;
  }>;

  signIn: (
    email: string,
    password: string
  ) => Promise<{
    error: string | null;
  }>;

  signInWithGoogle: () => Promise<void>;

  signOut: () => Promise<void>;


  // ----------------------------------------------------------
  // ROLE
  // ----------------------------------------------------------

  setRole: (
    role: UserRole
  ) => Promise<{
    error: string | null;
  }>;


  // ----------------------------------------------------------
  // REFRESH
  // ----------------------------------------------------------

  refreshProfile: () => Promise<void>;

  refreshSubscription: () => Promise<void>;
}


// ============================================================
// CONTEXT
// ============================================================

const AuthContext =
  createContext<AuthContextValue | undefined>(
    undefined
  );


// ============================================================
// PROVIDER
// ============================================================

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [session, setSession] =
    useState<Session | null>(null);

  const [profile, setProfile] =
    useState<Profile | null>(null);

  const [subscription, setSubscription] =
    useState<PMSSubscription | null>(null);

  const [loading, setLoading] =
    useState(true);


  // ==========================================================
  // FETCH PROFILE
  // ==========================================================

  const fetchProfile = async (
    userId: string
  ) => {
    const {
      data,
      error,
    } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error(
        'Profile fetch error:',
        error
      );

      setProfile(null);
      return;
    }

    setProfile(
      data as Profile | null
    );
  };


  // ==========================================================
  // FETCH PMS SUBSCRIPTION
  // ==========================================================

  const fetchSubscription = async (
    userId: string
  ) => {
    const {
      data,
      error,
    } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(
        'Subscription fetch error:',
        error
      );
      console.error('Subscription fetch error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });

      setSubscription(null);
      return;
    }

    setSubscription(
      data as PMSSubscription | null
    );
  };


  // ==========================================================
  // PMS ACCESS
  // ==========================================================

  /**
   * IMPORTANT:
   *
   * Do not simply check:
   *
   * subscription.status === 'active'
   *
   * because an active subscription may already have
   * passed expires_at.
   *
   * hasPMSAccess() handles:
   *
   * - active
   * - trial
   * - free plan
   * - expired date
   * - cancelled
   * - pending
   */
  const hasActivePMS =
    hasPMSAccess(subscription);


  // ==========================================================
  // ROLE SELECTION
  // ==========================================================

  const needsRoleSelection =
    !loading &&
    !!session &&
    !!profile &&
    !profile.role;


  // ==========================================================
  // LOAD USER DATA
  // ==========================================================

  const loadUserData = async (
    userId: string
  ) => {
    await Promise.all([
      fetchProfile(userId),
      fetchSubscription(userId),
    ]);
  };


  // ==========================================================
  // INITIAL AUTHENTICATION
  // ==========================================================

  useEffect(() => {
    let mounted = true;

    const initializeAuth =
      async () => {
        const {
          data: {
            session,
          },
        } =
          await supabase.auth.getSession();

        if (!mounted) return;

        setSession(session);

        if (session?.user) {
          await loadUserData(
            session.user.id
          );
        } else {
          setProfile(null);
          setSubscription(null);
        }

        if (mounted) {
          setLoading(false);
        }
      };

    initializeAuth();


    // ========================================================
    // AUTH STATE LISTENER
    // ========================================================

    const {
      data: listener,
    } =
      supabase.auth.onAuthStateChange(
        (_event, session) => {
          if (!mounted) return;

          setSession(session);

          // --------------------------------------------------
          // SIGNED OUT
          // --------------------------------------------------

          if (!session?.user) {
            setProfile(null);
            setSubscription(null);
            setLoading(false);
            return;
          }


          // --------------------------------------------------
          // SIGNED IN
          // --------------------------------------------------

          /*
           * Defer database requests so Supabase's auth
           * callback is not blocked by database operations.
           */
          setTimeout(async () => {
            if (!mounted) return;

            await loadUserData(
              session.user.id
            );

            if (mounted) {
              setLoading(false);
            }
          }, 0);
        }
      );


    // ========================================================
    // CLEANUP
    // ========================================================

    return () => {
      mounted = false;

      listener.subscription.unsubscribe();
    };
  }, []);


  // ==========================================================
  // SIGN UP
  // ==========================================================

  const signUp = async (
    email: string,
    password: string,
    fullName: string
  ) => {
    const {
      data,
      error,
    } =
      await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

    if (error) {
      return {
        error: error.message,
      };
    }


    // --------------------------------------------------------
    // CREATE PROFILE
    // --------------------------------------------------------

    if (data.user) {
      const {
        error: profileError,
      } =
        await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            email,
            full_name: fullName,
            role: null,
            verification_status:
              'unverified',
          });

      if (
        profileError &&
        !profileError.message.includes(
          'duplicate'
        )
      ) {
        console.error(
          'Profile creation error:',
          profileError
        );

        return {
          error:
            profileError.message,
        };
      }
    }

    return {
      error: null,
    };
  };


  // ==========================================================
  // SIGN IN
  // ==========================================================

  const signIn = async (
    email: string,
    password: string
  ) => {
    const {
      data,
      error,
    } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (error) {
      return {
        error: error.message,
      };
    }


    if (data.user) {

      // ------------------------------------------------------
      // CHECK PROFILE
      // ------------------------------------------------------

      const {
        data: existing,
      } =
        await supabase
          .from('profiles')
          .select('id')
          .eq(
            'id',
            data.user.id
          )
          .maybeSingle();


      // ------------------------------------------------------
      // CREATE PROFILE IF MISSING
      // ------------------------------------------------------

      if (!existing) {
        const {
          error: profileError,
        } =
          await supabase
            .from('profiles')
            .insert({
              id: data.user.id,

              email:
                data.user.email ||
                email,

              full_name:
                data.user
                  .user_metadata
                  ?.full_name ||
                '',

              role: null,

              verification_status:
                'unverified',
            });

        if (profileError) {
          console.error(
            'Profile creation error:',
            profileError
          );
        }
      }


      // ------------------------------------------------------
      // LOAD PROFILE + SUBSCRIPTION
      // ------------------------------------------------------

      await loadUserData(
        data.user.id
      );
    }

    return {
      error: null,
    };
  };


  // ==========================================================
  // GOOGLE SIGN IN
  // ==========================================================

  const signInWithGoogle =
    async () => {
      await supabase.auth.signInWithOAuth({
        provider: 'google',

        options: {
          redirectTo:
            window.location.origin,
        },
      });
    };


  // ==========================================================
  // SIGN OUT
  // ==========================================================

  const signOut = async () => {
    await supabase.auth.signOut();

    setProfile(null);
    setSession(null);
    setSubscription(null);
  };


  // ==========================================================
  // SET ROLE
  // ==========================================================

  const setRole = async (
    role: UserRole
  ) => {
    if (!session?.user) {
      return {
        error: 'Not authenticated',
      };
    }

    const {
      error,
    } =
      await supabase
        .from('profiles')
        .update({
          role,
        })
        .eq(
          'id',
          session.user.id
        );

    if (error) {
      return {
        error: error.message,
      };
    }

    await fetchProfile(
      session.user.id
    );

    return {
      error: null,
    };
  };


  // ==========================================================
  // REFRESH PROFILE
  // ==========================================================

  const refreshProfile =
    async () => {
      if (!session?.user) {
        return;
      }

      await fetchProfile(
        session.user.id
      );
    };


  // ==========================================================
  // REFRESH SUBSCRIPTION
  // ==========================================================

  const refreshSubscription =
    async () => {
      if (!session?.user) {
        setSubscription(null);
        return;
      }

      await fetchSubscription(
        session.user.id
      );
    };


  // ==========================================================
  // PROVIDER
  // ==========================================================

  return (
    <AuthContext.Provider
      value={{
        // ----------------------------------------------------
        // AUTH
        // ----------------------------------------------------

        session,

        profile,

        loading,

        needsRoleSelection,


        // ----------------------------------------------------
        // PMS
        // ----------------------------------------------------

        subscription,

        hasActivePMS,


        // ----------------------------------------------------
        // AUTH ACTIONS
        // ----------------------------------------------------

        signUp,

        signIn,

        signInWithGoogle,

        signOut,


        // ----------------------------------------------------
        // ROLE
        // ----------------------------------------------------

        setRole,


        // ----------------------------------------------------
        // REFRESH
        // ----------------------------------------------------

        refreshProfile,

        refreshSubscription,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}


// ============================================================
// HOOK
// ============================================================

export function useAuth() {
  const ctx =
    useContext(AuthContext);

  if (!ctx) {
    throw new Error(
      'useAuth must be used within AuthProvider'
    );
  }

  return ctx;
}
