import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import type {
  Session,
  User,
} from '@supabase/supabase-js';

import {
  supabase,
  type Profile,
  type UserRole,
} from '@/lib/supabase';

// ============================================================
// TYPES
// ============================================================

interface RegistrationEmailApplication {
  email: string;
  applicant_email?: string;
  full_name?: string;
  purpose?: string;
  [key: string]: unknown;
}

interface AuthResult {
  error: string | null;
  requiresEmailVerification?: boolean;
}

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;

  needsRoleSelection: boolean;

  needsEmailVerification: boolean;
  pendingVerificationEmail: string | null;

  /**
   * TRUE only when:
   *
   * 1. Supabase session exists
   * 2. Application profile exists
   * 3. profiles.email_verified = true
   */
  isAuthenticated: boolean;

  signUp: (
    email: string,
    password: string,
    fullName: string
  ) => Promise<AuthResult>;

  verifyEmailOtp: (
    email: string,
    otp: string
  ) => Promise<{
    error: string | null;
  }>;

  resendSignupOtp: (
    email: string
  ) => Promise<{
    error: string | null;
  }>;

  signIn: (
    email: string,
    password: string
  ) => Promise<AuthResult>;

  signInWithGoogle: () => Promise<void>;

  signOut: () => Promise<void>;

  setRole: (
    role: UserRole
  ) => Promise<{
    error: string | null;
  }>;

  refreshProfile: () => Promise<void>;
}

// ============================================================
// CONTEXT
// ============================================================

const AuthContext = createContext<
  AuthContextValue | undefined
>(undefined);

// ============================================================
// EMAIL FUNCTION
// ============================================================

/**
 * Sends application emails through the Supabase Edge Function.
 *
 * IMPORTANT:
 *
 * The browser NEVER generates or supplies the OTP.
 *
 * For otp_verification:
 *
 *   Browser
 *      ↓
 *   send-notification-emails
 *      ↓
 *   issue_signup_otp()
 *      ↓
 *   get_signup_otp_for_email()
 *      ↓
 *   Resend
 *
 * The plaintext OTP only exists inside the trusted
 * server-side Edge Function during email generation.
 */
const sendRegistrationEmail = async (
  type:
    | 'otp_verification'
    | 'sign_in_notification'
    | 'sign_up_welcome',
  application: RegistrationEmailApplication
): Promise<void> => {
  const FUNCTION_NAME = 'send-notification-emails';

  const {
    data,
    error,
  } = await supabase.functions.invoke(
    FUNCTION_NAME,
    {
      body: {
        type,
        application,
      },
    }
  );

  if (error) {
    let serverMessage =
      error.message ||
      'Email delivery failed.';

    try {
      const context = (
        error as {
          context?: Response;
        }
      ).context;

      if (context) {
        try {
          const responseBody =
            await context.json();

          if (
            typeof responseBody === 'object' &&
            responseBody !== null
          ) {
            const body =
              responseBody as {
                error?: unknown;
                message?: unknown;
              };

            if (
              typeof body.error === 'string'
            ) {
              serverMessage =
                body.error;
            } else if (
              typeof body.message === 'string'
            ) {
              serverMessage =
                body.message;
            }
          }
        } catch (jsonError) {
          console.error(
            'Unable to parse notification Edge Function response:',
            jsonError
          );
        }
      }
    } catch (readError) {
      console.error(
        'Unable to read notification Edge Function error:',
        readError
      );
    }

    console.error(
      `sendRegistrationEmail(${type}) failed:`,
      {
        error,
        serverMessage,
      }
    );

    throw new Error(serverMessage);
  }

  if (
    data &&
    typeof data === 'object' &&
    'success' in data &&
    data.success === false
  ) {
    const message =
      'error' in data &&
      typeof data.error === 'string'
        ? data.error
        : 'Email delivery failed.';

    throw new Error(message);
  }

  console.info(
    `sendRegistrationEmail(${type}) succeeded.`,
    data
  );
};

// ============================================================
// PROVIDER
// ============================================================

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  // ==========================================================
  // AUTH STATE
  // ==========================================================

  const [session, setSession] =
    useState<Session | null>(null);

  const [profile, setProfile] =
    useState<Profile | null>(null);

  const [loading, setLoading] =
    useState(true);

  // ==========================================================
  // EMAIL VERIFICATION STATE
  // ==========================================================

  const [
    needsEmailVerification,
    setNeedsEmailVerification,
  ] = useState(false);

  const [
    pendingVerificationEmail,
    setPendingVerificationEmail,
  ] = useState<string | null>(null);

  // ==========================================================
  // EMAIL HELPERS
  // ==========================================================

  const normalizeEmail = (
    email: string
  ): string => {
    return email.trim().toLowerCase();
  };

  const isValidEmail = (
    email: string
  ): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email.trim()
    );
  };

  // ==========================================================
  // APPLICATION EMAIL VERIFICATION
  // ==========================================================
  //
  // profiles.email_verified is the application's
  // verification source of truth.
  //
  // DO NOT use:
  //
  // user.email_confirmed_at
  //
  // for application authorization.
  //
  // ==========================================================

  const isProfileEmailVerified = (
    nextProfile: Profile | null
  ): boolean => {
    return Boolean(
      nextProfile?.email_verified
    );
  };

  // ==========================================================
  // CLEAR AUTH STATE
  // ==========================================================

  const clearAuthState = () => {
    setSession(null);
    setProfile(null);
  };

  // ==========================================================
  // SET VERIFICATION STATE
  // ==========================================================

  const requireEmailVerification = (
    email: string | null
  ) => {
    clearAuthState();

    setNeedsEmailVerification(true);

    setPendingVerificationEmail(
      email
        ? normalizeEmail(email)
        : null
    );
  };

  // ==========================================================
  // CLEAR VERIFICATION STATE
  // ==========================================================

  const clearVerificationState = () => {
    setNeedsEmailVerification(false);
    setPendingVerificationEmail(null);
  };

  // ==========================================================
  // FETCH PROFILE
  // ==========================================================

  const fetchProfile = async (
    userId: string
  ): Promise<Profile | null> => {
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

      return null;
    }

    const nextProfile =
      data as Profile | null;

    setProfile(nextProfile);

    return nextProfile;
  };

  // ==========================================================
  // APPLICATION AUTHENTICATION
  // ==========================================================

  const loadAuthenticatedUser = async (
    user: User,
    currentSession: Session
  ): Promise<boolean> => {
    const loadedProfile =
      await fetchProfile(user.id);

    // --------------------------------------------------------
    // PROFILE DOES NOT EXIST
    // --------------------------------------------------------

    if (!loadedProfile) {
      console.warn(
        'Authenticated Supabase user has no application profile.'
      );

      clearAuthState();
      clearVerificationState();

      return false;
    }

    // --------------------------------------------------------
    // PROFILE EXISTS BUT EMAIL IS NOT VERIFIED
    // --------------------------------------------------------

    if (
      !isProfileEmailVerified(
        loadedProfile
      )
    ) {
      requireEmailVerification(
        loadedProfile.email ||
          user.email ||
          null
      );

      /*
       * IMPORTANT:
       *
       * We deliberately do NOT call auth.signOut()
       * here.
       *
       * The temporary Supabase session can remain
       * available for the OTP flow.
       *
       * Application authorization is still denied
       * because:
       *
       * isAuthenticated === false
       */

      return false;
    }

    // --------------------------------------------------------
    // FULLY VERIFIED APPLICATION USER
    // --------------------------------------------------------

    setSession(currentSession);
    setProfile(loadedProfile);

    clearVerificationState();

    return true;
  };

  // ==========================================================
  // APPLICATION AUTH STATE
  // ==========================================================

  /**
   * A user is considered authenticated by the application
   * ONLY when both session and verified profile exist.
   */
  const isAuthenticated =
    Boolean(
      session &&
      profile &&
      profile.email_verified === true
    );

  const needsRoleSelection =
    !loading &&
    isAuthenticated &&
    !profile?.role;

  // ==========================================================
  // INITIAL AUTHENTICATION
  // ==========================================================

  useEffect(() => {
    let mounted = true;

    // --------------------------------------------------------
    // INITIALIZE
    // --------------------------------------------------------

    const initializeAuth = async () => {
      try {
        const {
          data: {
            session: currentSession,
          },
          error,
        } =
          await supabase.auth.getSession();

        if (error) {
          console.error(
            'Get session error:',
            error
          );
        }

        if (!mounted) {
          return;
        }

        // ----------------------------------------------------
        // NO SESSION
        // ----------------------------------------------------

        if (
          !currentSession?.user
        ) {
          clearAuthState();
          clearVerificationState();

          return;
        }

        // ----------------------------------------------------
        // SESSION EXISTS
        // ----------------------------------------------------

        await loadAuthenticatedUser(
          currentSession.user,
          currentSession
        );
      } catch (error) {
        console.error(
          'Auth initialization error:',
          error
        );

        if (mounted) {
          clearAuthState();
          clearVerificationState();
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void initializeAuth();

    // ========================================================
    // AUTH STATE LISTENER
    // ========================================================

    const {
      data: listener,
    } =
      supabase.auth.onAuthStateChange(
        (
          _event,
          currentSession
        ) => {
          if (!mounted) {
            return;
          }

          // --------------------------------------------------
          // SIGNED OUT
          // --------------------------------------------------

          if (
            !currentSession?.user
          ) {
            clearAuthState();
            clearVerificationState();

            setLoading(false);

            return;
          }

          /*
           * Delay the database query so the auth event
           * completes before we query profiles.
           */
          setTimeout(() => {
            if (!mounted) {
              return;
            }

            void (async () => {
              await loadAuthenticatedUser(
                currentSession.user,
                currentSession
              );

              if (mounted) {
                setLoading(false);
              }
            })();
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
  ): Promise<AuthResult> => {
    const normalizedEmail =
      normalizeEmail(email);

    const normalizedName =
      fullName.trim();

    // --------------------------------------------------------
    // VALIDATION
    // --------------------------------------------------------

    if (
      !isValidEmail(
        normalizedEmail
      )
    ) {
      return {
        error:
          'Please enter a valid email address.',
      };
    }

    if (password.length < 6) {
      return {
        error:
          'Password must be at least 6 characters long.',
      };
    }

    if (!normalizedName) {
      return {
        error:
          'Please enter your full name.',
      };
    }

    // --------------------------------------------------------
    // CREATE AUTH ACCOUNT
    // --------------------------------------------------------

    const {
      data,
      error,
    } =
      await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            full_name:
              normalizedName,
          },
        },
      });

    if (error) {
      console.error(
        'Supabase signup error:',
        error
      );

      return {
        error: error.message,
      };
    }

    // --------------------------------------------------------
    // EXISTING ACCOUNT DETECTION
    // --------------------------------------------------------

    /*
     * Supabase may return a user without identities when
     * the email already belongs to an account.
     *
     * That means:
     *
     *     DO NOT create another profile.
     *     DO NOT treat this as a new registration.
     *
     * The user must log in.
     */

    if (
      data.user &&
      Array.isArray(data.user.identities) &&
      data.user.identities.length === 0
    ) {
      clearAuthState();

      return {
        error:
          'An account with this email already exists. Please log in.',
      };
    }

    // --------------------------------------------------------
    // USER REQUIRED
    // --------------------------------------------------------

    if (!data.user) {
      return {
        error:
          'Unable to create your account.',
      };
    }

    // --------------------------------------------------------
    // PROFILE IS CREATED BY DATABASE TRIGGER
    // --------------------------------------------------------

    /*
     * The database trigger:
     *
     * auth.users INSERT
     *       ↓
     * profiles INSERT
     *       ↓
     * issue_signup_otp()
     *
     * Therefore the frontend must NOT insert the profile.
     */

    const loadedProfile =
      await fetchProfile(
        data.user.id
      );

    // --------------------------------------------------------
    // PROFILE NOT READY
    // --------------------------------------------------------

    if (!loadedProfile) {
      clearAuthState();

      return {
        error:
          'Your account was created, but your application profile could not be created. Please try again.',
      };
    }

    // --------------------------------------------------------
    // PROFILE EXISTS
    // --------------------------------------------------------

    if (
      !isProfileEmailVerified(
        loadedProfile
      )
    ) {
      requireEmailVerification(
        normalizedEmail
      );

      // ------------------------------------------------------
      // SEND OTP
      // ------------------------------------------------------

      const application:
        RegistrationEmailApplication = {
        email: normalizedEmail,

        applicant_email:
          normalizedEmail,

        full_name:
          normalizedName,

        purpose:
          'verify your Saka Krib account',
      };

      try {
        /*
         * The Edge Function generates/refreshes the OTP
         * server-side and retrieves the encrypted OTP
         * server-side.
         *
         * The browser never creates the OTP.
         */

        await sendRegistrationEmail(
          'otp_verification',
          application
        );
      } catch (error) {
        console.error(
          'OTP email delivery failed:',
          error
        );

        return {
          error:
            error instanceof Error
              ? `Your account was created, but the verification email could not be sent: ${error.message}`
              : 'Your account was created, but the verification email could not be sent.',
          requiresEmailVerification:
            true,
        };
      }

      return {
        error: null,
        requiresEmailVerification:
          true,
      };
    }

    // --------------------------------------------------------
    // ALREADY VERIFIED
    // --------------------------------------------------------

    if (data.session) {
      setSession(data.session);
    }

    setProfile(
      loadedProfile
    );

    clearVerificationState();

    // --------------------------------------------------------
    // WELCOME EMAIL
    // --------------------------------------------------------

    try {
      await sendRegistrationEmail(
        'sign_up_welcome',
        {
          email:
            normalizedEmail,

          applicant_email:
            normalizedEmail,

          full_name:
            normalizedName,
        }
      );
    } catch (error) {
      console.error(
        'Welcome email delivery failed:',
        error
      );
    }

    return {
      error: null,
      requiresEmailVerification:
        false,
    };
  };

  // ==========================================================
  // VERIFY EMAIL OTP
  // ==========================================================

  const verifyEmailOtp = async (
    email: string,
    otp: string
  ): Promise<{
    error: string | null;
  }> => {
    const normalizedEmail =
      normalizeEmail(email);

    const normalizedOtp =
      otp.replace(/\D/g, '');

    // --------------------------------------------------------
    // VALIDATION
    // --------------------------------------------------------

    if (
      !isValidEmail(
        normalizedEmail
      )
    ) {
      return {
        error:
          'Please enter a valid email address.',
      };
    }

    if (
      normalizedOtp.length !== 6
    ) {
      return {
        error:
          'Please enter the 6-digit verification code.',
      };
    }

    // --------------------------------------------------------
    // VERIFY CUSTOM OTP
    // --------------------------------------------------------

    const {
      data,
      error,
    } = await supabase.rpc(
      'verify_signup_otp',
      {
        p_email:
          normalizedEmail,

        p_otp:
          normalizedOtp,
      }
    );

    if (error) {
      console.error(
        'Email OTP verification RPC error:',
        error
      );

      return {
        error:
          error.message ||
          'Invalid or expired verification code.',
      };
    }

    // --------------------------------------------------------
    // PARSE RPC RESULT
    // --------------------------------------------------------

    const result =
      data as {
        success?: boolean;
        already_verified?: boolean;
        error?: string;
        profile_id?: string;
        email?: string;
        full_name?: string;
      };

    if (!result?.success) {
      return {
        error:
          result?.error ||
          'Invalid or expired verification code.',
      };
    }

    // --------------------------------------------------------
    // PROFILE ID
    // --------------------------------------------------------

    const profileId =
      result.profile_id;

    if (!profileId) {
      clearAuthState();
      clearVerificationState();

      return {
        error:
          'Email verification succeeded, but the account profile could not be identified.',
      };
    }

    // --------------------------------------------------------
    // FETCH VERIFIED PROFILE
    // --------------------------------------------------------

    const loadedProfile =
      await fetchProfile(
        profileId
      );

    if (!loadedProfile) {
      clearAuthState();

      return {
        error:
          'Your email was verified, but your application profile could not be loaded. Please sign in again.',
      };
    }

    // --------------------------------------------------------
    // DATABASE MUST CONFIRM VERIFIED STATE
    // --------------------------------------------------------

    if (
      !isProfileEmailVerified(
        loadedProfile
      )
    ) {
      requireEmailVerification(
        normalizedEmail
      );

      return {
        error:
          'Email verification has not been completed.',
      };
    }

    // --------------------------------------------------------
    // GET CURRENT SESSION
    // --------------------------------------------------------

    const {
      data: {
        session: currentSession,
      },
    } =
      await supabase.auth.getSession();

    /*
     * With the custom verification architecture, the
     * application uses profiles.email_verified as its
     * verification source of truth.
     *
     * If Supabase Auth email confirmation is enabled,
     * signUp may return no session. In that configuration
     * the user should sign in normally after verification.
     *
     * If the signup session exists, keep it.
     */

    if (currentSession) {
      setSession(
        currentSession
      );
    }

    setProfile(
      loadedProfile
    );

    clearVerificationState();

    return {
      error: null,
    };
  };

  // ==========================================================
  // RESEND SIGNUP OTP
  // ==========================================================

  const resendSignupOtp = async (
    email: string
  ): Promise<{
    error: string | null;
  }> => {
    const normalizedEmail =
      normalizeEmail(email);

    // --------------------------------------------------------
    // VALIDATION
    // --------------------------------------------------------

    if (
      !isValidEmail(
        normalizedEmail
      )
    ) {
      return {
        error:
          'Please enter a valid email address.',
      };
    }

    // --------------------------------------------------------
    // CHECK EXISTING PROFILE
    // --------------------------------------------------------

    /*
     * We intentionally do not query profiles from the
     * browser here.
     *
     * The Edge Function/database handles the account
     * state without exposing account existence.
     */

    requireEmailVerification(
      normalizedEmail
    );

    // --------------------------------------------------------
    // BUILD PAYLOAD
    // --------------------------------------------------------

    const application:
      RegistrationEmailApplication = {
      email:
        normalizedEmail,

      applicant_email:
        normalizedEmail,

      purpose:
        'verify your Saka Krib account',
    };

    // --------------------------------------------------------
    // CURRENT AUTH USER
    // --------------------------------------------------------

    const {
      data: {
        user,
      },
      error: userError,
    } =
      await supabase.auth.getUser();

    if (userError) {
      /*
       * This is expected for an unconfirmed account
       * when there is no active session.
       *
       * Do not fail resend because of it.
       */

      console.info(
        'No active Supabase session during OTP resend.'
      );
    }

    if (user?.user_metadata) {
      const metadata =
        user.user_metadata;

      if (
        typeof metadata.full_name ===
        'string'
      ) {
        application.full_name =
          metadata.full_name.trim();
      }
    }

    // --------------------------------------------------------
    // SEND FRESH OTP
    // --------------------------------------------------------

    try {
      await sendRegistrationEmail(
        'otp_verification',
        application
      );

      return {
        error: null,
      };
    } catch (error) {
      console.error(
        'OTP resend email delivery failed:',
        error
      );

      return {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to send a new verification code.',
      };
    }
  };

  // ==========================================================
  // SIGN IN
  // ==========================================================

  const signIn = async (
    email: string,
    password: string
  ): Promise<AuthResult> => {
    const normalizedEmail =
      normalizeEmail(email);

    // --------------------------------------------------------
    // VALIDATION
    // --------------------------------------------------------

    if (
      !isValidEmail(
        normalizedEmail
      )
    ) {
      return {
        error:
          'Please enter a valid email address.',
      };
    }

    if (!password) {
      return {
        error:
          'Please enter your password.',
      };
    }

    // --------------------------------------------------------
    // SIGN IN
    // --------------------------------------------------------

    const {
      data,
      error,
    } =
      await supabase.auth.signInWithPassword(
        {
          email:
            normalizedEmail,

          password,
        }
      );

    // --------------------------------------------------------
    // AUTH ERROR
    // --------------------------------------------------------

    if (error) {
      console.error(
        'Supabase sign-in error:',
        error
      );

      const message =
        error.message?.toLowerCase() ||
        '';

      // ------------------------------------------------------
      // EMAIL NOT CONFIRMED BY SUPABASE AUTH
      // ------------------------------------------------------

      if (
        message.includes(
          'email not confirmed'
        ) ||
        message.includes(
          'email not verified'
        ) ||
        message.includes(
          'not confirmed'
        )
      ) {
        requireEmailVerification(
          normalizedEmail
        );

        const resendResult =
          await resendSignupOtp(
            normalizedEmail
          );

        if (
          resendResult.error
        ) {
          return {
            error:
              `Your email has not been verified. ${resendResult.error}`,
            requiresEmailVerification:
              true,
          };
        }

        return {
          error:
            'Your email is not verified. A new verification code has been sent to your email.',
          requiresEmailVerification:
            true,
        };
      }

      return {
        error:
          error.message,
      };
    }

    // --------------------------------------------------------
    // SESSION REQUIRED
    // --------------------------------------------------------

    if (
      !data.user ||
      !data.session
    ) {
      clearAuthState();

      return {
        error:
          'Unable to create an authenticated session.',
      };
    }

    // --------------------------------------------------------
    // PROFILE REQUIRED
    // --------------------------------------------------------

    const loadedProfile =
      await fetchProfile(
        data.user.id
      );

    if (!loadedProfile) {
      console.warn(
        'Authenticated user has no application profile.'
      );

      clearAuthState();

      await supabase.auth.signOut();

      return {
        error:
          'Your account does not have an application profile. Please complete registration.',
      };
    }

    // --------------------------------------------------------
    // APPLICATION EMAIL VERIFICATION
    // --------------------------------------------------------

    if (
      !isProfileEmailVerified(
        loadedProfile
      )
    ) {
      requireEmailVerification(
        normalizedEmail
      );

      const resendResult =
        await resendSignupOtp(
          normalizedEmail
        );

      if (
        resendResult.error
      ) {
        return {
          error:
            `Your email is not verified. ${resendResult.error}`,
          requiresEmailVerification:
            true,
        };
      }

      return {
        error:
          'Your email is not verified. A new verification code has been sent to your email.',
        requiresEmailVerification:
          true,
      };
    }

    // --------------------------------------------------------
    // VERIFIED SIGN IN
    // --------------------------------------------------------

    setSession(
      data.session
    );

    setProfile(
      loadedProfile
    );

    clearVerificationState();

    // --------------------------------------------------------
    // SIGN-IN NOTIFICATION
    // --------------------------------------------------------

    try {
      await sendRegistrationEmail(
        'sign_in_notification',
        {
          email:
            normalizedEmail,

          applicant_email:
            normalizedEmail,

          full_name:
            loadedProfile.full_name ??
            undefined,
        }
      );
    } catch (emailError) {
      console.error(
        'Sign-in notification email failed:',
        emailError
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
    async (): Promise<void> => {
      const {
        error,
      } =
        await supabase.auth.signInWithOAuth(
          {
            provider: 'google',

            options: {
              redirectTo:
                window.location.origin,
            },
          }
        );

      if (error) {
        console.error(
          'Google sign-in error:',
          error
        );
      }
    };

  // ==========================================================
  // SIGN OUT
  // ==========================================================

  const signOut =
    async (): Promise<void> => {
      const {
        error,
      } =
        await supabase.auth.signOut();

      if (error) {
        console.error(
          'Sign out error:',
          error
        );
      }

      clearAuthState();
      clearVerificationState();
    };

  // ==========================================================
  // SET ROLE
  // ==========================================================

  const setRole = async (
    role: UserRole
  ): Promise<{
    error: string | null;
  }> => {
    // --------------------------------------------------------
    // SESSION REQUIRED
    // --------------------------------------------------------

    if (!session?.user) {
      return {
        error:
          'Not authenticated.',
      };
    }

    // --------------------------------------------------------
    // PROFILE REQUIRED
    // --------------------------------------------------------

    if (!profile) {
      return {
        error:
          'Application profile is required.',
      };
    }

    // --------------------------------------------------------
    // EMAIL VERIFICATION REQUIRED
    // --------------------------------------------------------

    if (
      !isProfileEmailVerified(
        profile
      )
    ) {
      return {
        error:
          'Email verification is required before setting a role.',
      };
    }

    // --------------------------------------------------------
    // UPDATE ROLE
    // --------------------------------------------------------

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
        error:
          error.message,
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
    async (): Promise<void> => {
      // ------------------------------------------------------
      // SESSION REQUIRED
      // ------------------------------------------------------

      if (!session?.user) {
        clearAuthState();

        return;
      }

      // ------------------------------------------------------
      // FETCH PROFILE
      // ------------------------------------------------------

      const loadedProfile =
        await fetchProfile(
          session.user.id
        );

      // ------------------------------------------------------
      // PROFILE DISAPPEARED
      // ------------------------------------------------------

      if (!loadedProfile) {
        console.warn(
          'Application profile no longer exists. Signing user out.'
        );

        clearAuthState();

        await supabase.auth.signOut();

        return;
      }

      // ------------------------------------------------------
      // EMAIL NO LONGER VERIFIED
      // ------------------------------------------------------

      if (
        !isProfileEmailVerified(
          loadedProfile
        )
      ) {
        requireEmailVerification(
          loadedProfile.email ||
            session.user.email ||
            null
        );

        return;
      }

      // ------------------------------------------------------
      // VERIFIED
      // ------------------------------------------------------

      setSession(
        session
      );

      setProfile(
        loadedProfile
      );

      clearVerificationState();
    };

  // ==========================================================
  // PROVIDER
  // ==========================================================

  return (
    <AuthContext.Provider
      value={{
        session,

        profile,

        loading,

        needsRoleSelection,

        needsEmailVerification,

        pendingVerificationEmail,

        isAuthenticated,

        signUp,

        verifyEmailOtp,

        resendSignupOtp,

        signIn,

        signInWithGoogle,

        signOut,

        setRole,

        refreshProfile,
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