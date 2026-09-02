import { useState } from 'react';
import PMSPlanSelector, { type PMSBillingCycle, type PMSPlanName, type PMSSubscriptionPlan } from './PMSPlanSelector';

interface Props {
  role: 'landlord' | 'real_estate';
  listingId: string | null;
  onPaymentSuccess: () => void;
  onGoToDashboard: () => void;
}

export default function PMSPlanSelectorForListing({ role, listingId, onPaymentSuccess, onGoToDashboard }: Props) {
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedPlanName, setSelectedPlanName] = useState<PMSPlanName | null>(null);
  const [billingCycle, setBillingCycle] = useState<PMSBillingCycle>('MONTHLY');

  const handlePlanChange = (plan: PMSSubscriptionPlan) => {
    setSelectedPlanId(plan.id);
    setSelectedPlanName(plan.name);
  };

  return (
    <PMSPlanSelector
      role={role}
      listingId={listingId}
      selectedPlanId={selectedPlanId}
      selectedPlanName={selectedPlanName}
      billingCycle={billingCycle}
      onPlanChange={handlePlanChange}
      onBillingCycleChange={setBillingCycle}
      onPaymentSuccess={onPaymentSuccess}
      onGoToDashboard={onGoToDashboard}
    />
  );
}
