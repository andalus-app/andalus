/* ═══════════════════════════════════════════════════════
   TYPOGRAPHY SYSTEM
   Import this wherever you need font styles.
   ═══════════════════════════════════════════════════════ */

export const FONTS = {
  timer: "'D-DIN', 'Inter', system-ui, sans-serif",
  ui:    "'Inter', system-ui, sans-serif",
};

/* ── Reusable style objects ── */

/**
 * TIMER  — countdown, e.g. 04:53:22
 * D-DIN Bold, tabular nums, no layout shift
 */
export const timerStyle = {
  fontFamily:          FONTS.timer,
  fontWeight:          700,
  fontVariantNumeric:  'tabular-nums',
  letterSpacing:       '0.02em',
  fontFeatureSettings: '"tnum" 1',    /* fallback for older browsers */
  textAlign:           'center',
  minWidth:            '6ch',         /* prevents width jumping */
};

/**
 * PRAYER TIMES  — 03:49, 17:48 …
 * Inter Medium, tabular nums
 */
export const prayerTimeStyle = {
  fontFamily:          FONTS.ui,
  fontWeight:          500,
  fontVariantNumeric:  'tabular-nums',
  fontFeatureSettings: '"tnum" 1',
};

/**
 * HEADINGS  — Stockholm, Dagens böner, Tid kvar till …
 * Inter SemiBold
 */
export const headingStyle = {
  fontFamily: FONTS.ui,
  fontWeight: 600,
};

/**
 * INFORMATION TEXT  — Lördag 14 Mars, 25 Ramadan 1447 AH …
 * Inter Regular
 */
export const infoTextStyle = {
  fontFamily: FONTS.ui,
  fontWeight: 400,
};

/**
 * BOTTOM NAV LABELS  — Hem, Bönetider, Qibla …
 * Inter Medium
 */
export const navLabelStyle = {
  fontFamily: FONTS.ui,
  fontWeight: 500,
};

/**
 * ALL NUMERIC ELEMENTS get tabular nums
 * Apply to any date, number, stat
 */
export const tabularNums = {
  fontVariantNumeric:  'tabular-nums',
  fontFeatureSettings: '"tnum" 1',
};
