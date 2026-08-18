const verifyAuthOtp = async () => {
  if (!/^\d{6}$/.test(otp)) {
    setError('Please enter the 6-digit verification code.');
    return;
  }

  setLoading(true);
  setError(null);
  setInfo(null);

  try {
    const { data, error: functionError } =
      await supabase.functions.invoke('verify-auth', {
        body: {
          email: pendingEmail,
          otp,
          purpose: otpPurpose,
        },
      });

    if (functionError) {
      throw functionError;
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    /*
     * The Edge Function should establish/return
     * the authenticated Supabase session.
     *
     * If it returns access_token + refresh_token,
     * establish the client session here.
     */

    if (
      data?.access_token &&
      data?.refresh_token
    ) {
      const {
        error: sessionError,
      } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });

      if (sessionError) {
        throw sessionError;
      }
    }

    setMode('signin');
    setOtp('');
    setPendingEmail('');

    setAuthModalOpen(false);

    if (otpPurpose === 'signup') {
      setTimeout(() => {
        setRoleModalOpen(true);
      }, 200);
    }
  } catch (err) {
    console.error('OTP verification failed:', err);

    setError(
      err instanceof Error
        ? err.message
        : 'Invalid or expired verification code.'
    );
  } finally {
    setLoading(false);
  }
};