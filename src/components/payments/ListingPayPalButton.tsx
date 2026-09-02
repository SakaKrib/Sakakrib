import PayPalPaymentButton from './PayPalPaymentButton';

interface ListingPayPalButtonProps {
  paymentIntentId: string | null;
  onSuccess: () => Promise<void> | void;
  onError?: (message: string) => void;
  disabled?: boolean;
}

export default function ListingPayPalButton({ paymentIntentId, onSuccess, onError, disabled = false }: ListingPayPalButtonProps) {
  if (!paymentIntentId) {
    return (
      <div className="rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-700 dark:border-warning-800 dark:bg-warning-900/20 dark:text-warning-300">
        Your listing payment is being prepared. Please wait a moment, then try PayPal again.
      </div>
    );
  }

  return (
    <PayPalPaymentButton
      mode="ONE_TIME"
      paymentIntentId={paymentIntentId}
      onSuccess={onSuccess}
      onError={onError}
      disabled={disabled}
    />
  );
}
