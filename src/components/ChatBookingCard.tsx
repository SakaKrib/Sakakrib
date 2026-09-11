      socket.onmessage = event => {
        try {
          const payload = JSON.parse(event.data) as {
            type?: string;
            booking?: Partial<Booking> & { id?: string };
            notification?: { notification_type?: string; data?: Record<string, unknown> };
          };
          const payloadBookingId = String(payload.booking?.id ?? payload.notification?.data?.booking_id ?? '');
          if (payloadBookingId !== String(authoritativeBookingId)) return;
          if (payload.type === 'booking' && payload.booking) {
            setLiveBooking(previous => previous ? { ...previous, ...payload.booking, id: previous.id } : eventBookingId ? null : (booking ?? null));
            return;
          }
          if (payload.type === 'notification') {
            void protectedGet<Booking>(`/api/core/bookings/${authoritativeBookingId}/`).then(result => { if (!cancelled && result) setLiveBooking(result); }).catch(() => undefined);
          }
        } catch { /* ignore malformed websocket events */ }
      };
      socket.onerror = () => socket?.close();