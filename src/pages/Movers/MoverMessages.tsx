import { MessageCircle } from 'lucide-react';
import { useNav } from '@/context/NavContext';

export default function MoverMessages() {
  const { navigate } = useNav();
  return <div className="mx-auto max-w-4xl px-2 py-6 sm:px-6 lg:px-8 lg:py-8"><div className="mb-6"><button type="button" onClick={() => navigate('dashboard')} className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">← Back to dashboard</button><h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Mover messages</h1><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Open your customer conversations and booking communication.</p></div><div className="card p-8 text-center"><MessageCircle className="mx-auto h-10 w-10 text-brand-500" /><h2 className="mt-3 font-bold text-gray-900 dark:text-white">Messages</h2><p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">Your existing chat workspace handles mover conversations. Continue there to view and send messages.</p><button type="button" onClick={() => navigate('chat')} className="btn-primary mt-5">Open messages</button></div></div>;
}
