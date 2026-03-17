/**
 * useIsPWA — returnerar true om appen körs som installerad PWA (standalone).
 *
 * iOS Safari:  window.navigator.standalone === true  (sätts av WebKit)
 * Android/desktop: matchMedia('display-mode: standalone') matchar
 *
 * I vanlig Safari/webbläsare returnerar den false.
 */
export function useIsPWA() {
  return (
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}
