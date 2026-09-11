import PMSInvoiceHistory from './PMSInvoiceHistory';
import PMSSubscriptionPage from './PMSSubscriptionPage';

export default function PMSSubscriptionPageWithHistory() {
  return (
    <>
      <PMSSubscriptionPage />
      <section className="mx-auto max-w-7xl px-2 pb-8 sm:px-6 lg:px-8">
        <PMSInvoiceHistory />
      </section>
    </>
  );
}
