/**
 * Analytics tracking helper para Tech & Development Newsletter
 * Registra eventos na dataLayer ou fila personalizada para prontidão de analytics (GA4, Plausible, PostHog).
 */

if (typeof window !== 'undefined') {
  window.dataLayer = window.dataLayer || [];
}

export function trackEvent(eventName, payload = {}) {
  const eventData = {
    event: eventName,
    timestamp: new Date().toISOString(),
    ...payload
  };

  if (typeof window !== 'undefined') {
    window.dataLayer.push(eventData);
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
      console.log('[Analytics Event]', eventName, payload);
    }
  }
}
