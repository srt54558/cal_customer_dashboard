***

## Skill: `cal_style_scheduling_ui`

### Purpose

Generate scheduling / booking UIs that closely resemble Cal.com’s product style: grayscale‑first, infrastructure‑grade SaaS UI with light/dark themes, configurable brand color, and Tailwind‑compatible design tokens. [design.cal](https://design.cal.com/basics/colors)

***

### When to Use

The skill should be applied when:

- Building booking pages, scheduling dashboards, or embed widgets that should “feel like Cal.com.” [cal](https://cal.com/embed)
- Designing white‑label, themeable UIs where host brands can override primary color without breaking structure. [calcom.framer](https://calcom.framer.website/blog/enhance-your-brand-with-custom-theme-colors-on-cal-com)

***

### Inputs

The calling system should provide at least:

- `brand.name` (string): Name of the product/organization.  
- `brand.primaryColorLight` (hex, optional): Desired primary accent in light mode; if omitted, use default from Tailwind config below. [x](https://x.com/calcom/status/1939391052143558804)
- `brand.primaryColorDark` (hex, optional): Primary accent for dark mode; slightly brighter/saturated than light for contrast. [calcom.framer](https://calcom.framer.website/blog/enhance-your-brand-with-custom-theme-colors-on-cal-com)
- `ui.context` (enum): `"public-booking" | "manage-events" | "team-dashboard" | "embed-widget"`.  
- `ui.density` (enum): `"compact" | "comfortable"` (affects spacing, but not typography).  
- `ui.theme` (enum): `"light" | "dark" | "system"`.

***

### Outputs

The skill should output:

1. **Design tokens** in terms of semantic Tailwind colors and CSS variables (see next section).  
2. **Layout spec**: sections, components, their hierarchy, responsive behavior (desktop + mobile).  
3. **Component spec**: for buttons, inputs, calendar, time slots, booking summary, modals, and embeds.  
4. **Copy spec**: concise, neutral strings for labels, helper text, confirmations, and errors.

***

## Hard Visual Constraints

The AI **must** respect these:

1. **Grayscale‑first base**  
   - Backgrounds, surfaces, borders, and default text are neutral grays taken from the provided palette. [cal](https://cal.com/docs/self-hosting/guides/white-labeling/color-tokens)
   - Accent color (brand) is used only for CTAs, selected dates/slots, active navigation, and key highlights. [cal](https://cal.com/blog/enhance-your-brand-with-custom-theme-colors-on-cal-com)

2. **Functional minimalism**  
   - No decorative blobs, neon gradients, or “AI‑slop” illustrations in core booking flows. [design.cal](https://design.cal.com/basics/colors)
   - Prefer solid or very light neutral surfaces; shadows are subtle and used only for elevation.

3. **Application‑style layouts**  
   - Public booking pages: content‑constrained, column‑based layouts with forms, calendars, and slot lists as the focus. [cal](https://cal.com/blog/online-booking-system)
   - Internal screens: sidebar + main content, cards and tables; not marketing‑style banded sections. [design-sites.botubot](https://design-sites.botubot.ru/en/project/cal-com-web/)

4. **Typography**  
   - Display font: for headings ≥ 20–28 px only, never for body; similar role to Cal Sans. [design.cal](https://design.cal.com/basics/typography)
   - Body font: neutral sans (Inter‑like) for all dense text (14–16 px). [design.cal](https://design.cal.com/basics/typography)

***

## Tailwind Color Tokens (Concrete Values)

These values are aligned with Cal.com’s published background tokens and Tailwind‑style neutrals. Background tokens are taken directly from Cal docs where available; text/border/brand tokens are opinionated defaults designed to match. [cal](https://cal.com/docs/self-hosting/guides/white-labeling/color-tokens)

### 1. Base CSS Variables (from Cal docs + safe defaults)

Use these in a global CSS file:

```css
:root {
  /* Background surfaces (light) – direct from Cal docs where shown */
  --cal-bg-emphasis: #e5e7eb;  /* Emphasized panel / header */  /* [Cal docs] */
  --cal-bg: #ffffff;           /* Page background */
  --cal-bg-subtle: #f3f4f6;    /* Cards, inputs */
  --cal-bg-muted: #f9fafb;     /* Muted surfaces, sidebars */
  --cal-bg-inverted: #111827;  /* Dark chips / inverted text bg */

  /* Component backgrounds (light) – from Cal docs */
  --cal-bg-info: #dee9fc;
  --cal-bg-success: #e2fbe8;
  --cal-bg-attention: #fceed8;
  --cal-bg-error: #f9e3e2;
  --cal-bg-dark-error: #752522; /* Critical areas */            /* [Cal docs] */

  /* Text (opinionated but Tailwind‑aligned) */
  --cal-text-primary: #111827;  /* gray-900 */
  --cal-text-muted: #4b5563;    /* gray-600 */
  --cal-text-subtle: #9ca3af;   /* gray-400 */
  --cal-text-inverted: #f9fafb; /* near-white on dark surfaces */

  /* Borders (opinionated) */
  --cal-border-subtle: #e5e7eb; /* gray-200 */
  --cal-border-strong: #9ca3af; /* gray-400 */

  /* Brand (defaults – can be overridden by brand.primaryColor*) */
  --cal-brand-primary: #06b6d4;        /* cyan-500-ish */
  --cal-brand-primary-strong: #0891b2; /* cyan-600-ish */
  --cal-brand-on-primary: #f9fafb;     /* text on brand */
}

/* Dark mode – background tokens per Cal docs; other values harmonized */
:root.dark {
  --cal-bg-emphasis: #2b2b2b;
  --cal-bg: #101010;
  --cal-bg-subtle: #2b2b2b;
  --cal-bg-muted: #1c1c1c;
  --cal-bg-inverted: #f3f4f6;

  --cal-bg-info: #1d2a3f;      /* darkened info */
  --cal-bg-success: #123821;   /* darkened success */
  --cal-bg-attention: #412918; /* darkened attention */
  --cal-bg-error: #3f1514;     /* darkened error */
  --cal-bg-dark-error: #752522;

  --cal-text-primary: #e5e7eb; /* gray-200 */
  --cal-text-muted: #9ca3af;   /* gray-400 */
  --cal-text-subtle: #6b7280;  /* gray-500 */
  --cal-text-inverted: #0b1120;

  --cal-border-subtle: #27272a; /* zinc-800 */
  --cal-border-strong: #4b5563;

  --cal-brand-primary: #22d3ee;        /* lighter in dark */
  --cal-brand-primary-strong: #06b6d4;
  --cal-brand-on-primary: #0f172a;
}
```

(Background values marked as coming from Cal’s `globals.css` are from their docs; others are consistent Tailwind‑style defaults.) [design.cal](https://design.cal.com/basics/colors)

### 2. Tailwind Config Mapping

Example `tailwind.config.js` snippet (v3‑style) that exposes semantic roles:

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        cal: {
          // background surfaces
          bg: {
            DEFAULT: 'var(--cal-bg)',
            subtle: 'var(--cal-bg-subtle)',
            muted: 'var(--cal-bg-muted)',
            emphasis: 'var(--cal-bg-emphasis)',
            inverted: 'var(--cal-bg-inverted)',
            info: 'var(--cal-bg-info)',
            success: 'var(--cal-bg-success)',
            attention: 'var(--cal-bg-attention)',
            error: 'var(--cal-bg-error)',
            darkError: 'var(--cal-bg-dark-error)',
          },
          // text
          text: {
            primary: 'var(--cal-text-primary)',
            muted: 'var(--cal-text-muted)',
            subtle: 'var(--cal-text-subtle)',
            inverted: 'var(--cal-text-inverted)',
          },
          // borders
          border: {
            subtle: 'var(--cal-border-subtle)',
            strong: 'var(--cal-border-strong)',
          },
          // brand
          brand: {
            primary: 'var(--cal-brand-primary)',
            primaryStrong: 'var(--cal-brand-primary-strong)',
            onPrimary: 'var(--cal-brand-on-primary)',
          },
        },
      },
    },
  },
};
```

Usage examples:

- Backgrounds: `bg-cal-bg`, `bg-cal-bg-subtle`, `bg-cal-bg-info`.  
- Text: `text-cal-text-primary`, `text-cal-text-muted`.  
- Borders: `border-cal-border-subtle`.  
- Brand: `bg-cal-brand-primary`, `text-cal-brand-on-primary`.

To support instance‑wide branding (as in Cal’s theming docs), override only the CSS variables (`--cal-brand-primary`, etc.) based on `brand.primaryColorLight` / `brand.primaryColorDark` and leave components using these Tailwind semantics untouched. [cal](https://cal.com/blog/enhance-your-brand-with-custom-theme-colors-on-cal-com)

***

## Layout & Component Rules (Condensed for Skill)

### Layout

- **Public booking page (`ui.context = "public-booking"`)**  
  - Single primary column; max width around 640–960 px.  
  - Order: title → short description → calendar → time slot list → booking form → confirmation or footer. [cal](https://cal.com/features/embed)
  - On mobile, stack into one column; ensure slots and buttons remain ≥ ~40–44 px tall.

- **Management / dashboard (`"manage-events" | "team-dashboard"`)**  
  - Sidebar nav (left) + main content.  
  - Main content organized as cards and tables on `bg-cal-bg-subtle` with subtle borders.  
  - Avoid marketing‑style full‑bleed hero sections.

### Typography

- Page titles: 24–28 px, display font, `text-cal-text-primary`.  
- Section headings: 20–24 px, display or bold body font.  
- Body text: 14 px body font; important single‑line labels may use 16 px.  
- Metadata/helper text: 12 px in `text-cal-text-muted` or `text-cal-text-subtle`. [design.cal](https://design.cal.com/basics/typography)

### Core Components

For each generated screen, the AI should include:

- **Buttons**  
  - Primary: `bg-cal-brand-primary text-cal-brand-on-primary` (+ hover/active via `primaryStrong`).  
  - Secondary: `border-cal-border-subtle bg-cal-bg-subtle text-cal-text-primary`.  
  - Destructive: neutral structure tinted with `bg-cal-bg-error` and error‑colored text.

- **Inputs**  
  - Background `bg-cal-bg`, border `border-cal-border-subtle`, radius 4–6 px.  
  - Label above (12–14 px, `text-cal-text-muted`), helper text below (12 px, `text-cal-text-subtle`).  
  - Focus: border color shifts to `cal-brand-primary`, with subtle shadow.

- **Calendar**  
  - 7‑column grid with weekday headers in `text-cal-text-muted`.  
  - Today lightly outlined; selected day uses `bg-cal-brand-primary text-cal-brand-on-primary`.  
  - Disabled/unavailable dates in `text-cal-text-subtle`, no hover/active.

- **Time slot list**  
  - Vertical list of pills: `border-cal-border-subtle bg-cal-bg-subtle`.  
  - Selected slot uses brand background; hover uses `bg-cal-bg-subtle` tinted via brand.

- **Booking summary card**  
  - `bg-cal-bg-subtle`, small radius, subtle shadow.  
  - Primary details (date/time) at 16 px and semibold; secondary details muted.

- **Modals/drawers**  
  - Overlay on `cal-bg` using a translucent black backdrop.  
  - Panel uses `bg-cal-bg-emphasis`, title at 20–24 px, body 14–16 px, actions aligned right.

***

## Behavioral & Copy Rules

- Always provide clear loading, success, and error states in booking flows. [cal](https://cal.com/blog/online-booking-system)
- Microcopy is neutral and concise: “Choose a time that works for you”, “Confirm booking”. [cal](https://cal.com/blog/online-booking-system)
- Error text explains what happened and what to do next, without exposing technical details.

***
