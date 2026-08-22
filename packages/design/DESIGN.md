# Style Reference

> Analytical Blueprint on Pure White. An interface that feels like a meticulously charted course on a pristine, well-lit canvas.

**Theme:** light

Mission Pulse exudes a focused, data-driven clarity, presenting complex financial automation with understated confidence. The design leverages a monochrome palette with strategic pops of a vibrant blue and a scattered, almost playful set of bright accent colors in secondary elements. Dominating the visual landscape is a unique pairing of a classic serif display font for impactful headlines and a clean, modern sans-serif for body text, creating a formal yet approachable feel. The near-achromatic backgrounds and lack of strong shadows contribute to a flat, spacious interface, elevating content through thoughtful typography rather than heavy visual effects. A subtle brand blue is employed sparingly, primarily to highlight interactive elements, guiding user attention with precision.

## Tokens — Colors

| Name           | Value     | Token                    | Role                                                                                                                                                |
| -------------- | --------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page Canvas    | `#f5f5f4` | `--color-page-canvas`    | Primary background for pages and major sections, providing a clean, bright foundation.                                                              |
| Surface White  | `#ffffff` | `--color-surface-white`  | Used for cards, panels, and elements needing to stand out slightly from the main background, often appearing as content containers.                 |
| Blueprint Blue | `#0b64e9` | `--color-blueprint-blue` | Primary brand accent, used for all calls-to-action, interactive states, and key navigational elements to draw attention without being overwhelming. |
| Text Primary   | `#0c0a09` | `--color-text-primary`   | Main body text, headlines, and critical information for maximum readability against light backgrounds.                                              |
| Text Secondary | `#1c1917` | `--color-text-secondary` | Subheadings, supporting text, and less emphasized information, a subtle step lighter than primary text but still high contrast.                     |
| Text Muted     | `#6b6561` | `--color-text-muted`     | Placeholder text, minor labels, and supplementary details, providing a softer visual presence.                                                      |
| Text Subtle    | `#57534d` | `--color-text-subtle`    | Less prominent text like captions or descriptions, visually receding while remaining legible.                                                       |
| Text On Bright | `#0c0a09` | `--color-text-on-bright` | Text on saturated status/accent fills (grade badges, tags). Never flips in dark theme since its fills keep their light-mode values.                 |
| Subtle Gray    | `#ececea` | `--color-subtle-gray`    | Backgrounds for subtle containers like badges or minor card elements, offering a hint of differentiation.                                           |
| Border Light   | `#f0efef` | `--color-border-light`   | Distinguishes UI elements with a subtle border, especially for form fields and interactive elements.                                                |
| Disabled Gray  | `#d4d2d1` | `--color-disabled-gray`  | Used for disabled states of interactive components, indicating non-interactability.                                                                 |
| Status Red     | `#f24149` | `--color-status-red`     | Indicator for errors or important alerts, drawing quick attention.                                                                                  |
| Status Orange  | `#f97006` | `--color-status-orange`  | Highlighting warnings or moderate priority information.                                                                                             |
| Status Yellow  | `#f9b703` | `--color-status-yellow`  | For informational highlights or less critical status indicators.                                                                                    |
| Status Violet  | `#6b4aff` | `--color-status-violet`  | Likely for specific status tags or categories, providing visual distinction.                                                                        |
| Accent Green   | `#0d9488` | `--color-accent-green`   | Positive or successful supporting signal, used sparingly for secondary status states.                                                               |
| Accent Amber   | `#d97706` | `--color-accent-amber`   | Cautionary supporting signal, used sparingly for medium-priority status states.                                                                     |

## Tokens — Typography

### FH Total Display Regular — Hero and display headings — the signature typeface for brand impact, creating an elegant, authoritative presence with extreme size and tight line height. · `--font-fh-total-display-regular`

- **Substitute:** Playfair Display
- **Weights:** 400
- **Sizes:** 106px, 183px
- **Line height:** 0.80
- **Role:** Hero and display headings — the signature typeface for brand impact, creating an elegant, authoritative presence with extreme size and tight line height.

### Geist — Primary body and subheadings — a modern, geometric sans-serif that balances the classic display font with clarity and digital readability. · `--font-geist`

- **Substitute:** Inter
- **Weights:** 400, 500
- **Sizes:** 14px, 16px, 18px, 20px, 24px, 28px
- **Line height:** 1.20, 1.30, 1.40
- **Letter spacing:** -0.02
- **OpenType features:** `"blwf" on, "cv03" on, "cv04" on, "cv09" on, "cv11" on`
- **Role:** Primary body and subheadings — a modern, geometric sans-serif that balances the classic display font with clarity and digital readability.

### system-ui — Secondary body text and utility content — ensures broad compatibility and performance for smaller text blocks, leveraging system fonts for efficiency. · `--font-system-ui`

- **Weights:** 400, 500
- **Sizes:** 10px, 12px, 14px
- **Line height:** 1.30
- **Letter spacing:** -0.03
- **Role:** Secondary body text and utility content — ensures broad compatibility and performance for smaller text blocks, leveraging system fonts for efficiency.

### sans-serif — Smallest UI text, labels, and metadata — a fallback simple sans-serif for minimal text elements where space is constrained. · `--font-sans-serif`

- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.20
- **Role:** Smallest UI text, labels, and metadata — a fallback simple sans-serif for minimal text elements where space is constrained.

### Type Scale

Rem-based, fixed (product register). Letter-spacing is intentionally **not** in text tokens —
it's set per-element (uppercase labels tracked wide, body neutral). Tokens follow Tailwind v4's
`--text-*` / `--text-*--line-height` namespace so `text-*` utilities are generated.

| Role            | rem     | px  | Line Height | Absorbs                       | Token                    |
| --------------- | ------- | --- | ----------- | ----------------------------- | ------------------------ |
| micro           | 0.625   | 10  | 1.4         | 8–10px micro-labels           | `--text-micro`           |
| caption         | 0.6875  | 11  | 1.45        | 11px secondary text           | `--text-caption`         |
| meta            | 0.75    | 12  | 1.5         | `text-xs`, 12px metadata      | `--text-meta`            |
| body            | 0.8125  | 13  | 1.55        | `text-[13px]`, body copy      | `--text-body`            |
| body-lg         | 0.875   | 14  | 1.55        | `text-sm`, 14px               | `--text-body-lg`         |
| subheading      | 1       | 16  | 1.4         | `text-base`, 16px             | `--text-subheading`      |
| heading         | 1.125   | 18  | 1.3         | `text-lg`, 18px               | `--text-heading`         |
| heading-lg      | 1.25    | 20  | 1.25        | `text-xl`, 20px               | `--text-heading-lg`      |
| display-sm      | 1.5     | 24  | 1.2         | `text-2xl`, 24px              | `--text-display-sm`      |
| display         | 1.75    | 28  | 1.15        | 28px                          | `--text-display`         |
| display-lg      | 2.25    | 36  | 1.1         | empty-state / large display   | `--text-display-lg`      |
| hero-headline-1 | 6.625   | 106 | 0.8         | landing hero (layered, tight) | `--text-hero-headline-1` |
| hero-headline-2 | 11.4375 | 183 | 0.8         | landing hero (layered, tight) | `--text-hero-headline-2` |

## Tokens — Spacing & Shapes

**Base unit:** 4px

**Density:** compact

### Spacing Scale

| Name | Value | Token           |
| ---- | ----- | --------------- |
| 4    | 4px   | `--spacing-4`   |
| 8    | 8px   | `--spacing-8`   |
| 12   | 12px  | `--spacing-12`  |
| 16   | 16px  | `--spacing-16`  |
| 20   | 20px  | `--spacing-20`  |
| 24   | 24px  | `--spacing-24`  |
| 32   | 32px  | `--spacing-32`  |
| 36   | 36px  | `--spacing-36`  |
| 40   | 40px  | `--spacing-40`  |
| 44   | 44px  | `--spacing-44`  |
| 80   | 80px  | `--spacing-80`  |
| 120  | 120px | `--spacing-120` |
| 140  | 140px | `--spacing-140` |

### Border Radius

| Element | Value |
| ------- | ----- |
| pill    | 100px |
| large   | 12px  |
| buttons | 8px   |
| default | 6px   |

### Shadows

| Name     | Value                                   | Token               |
| -------- | --------------------------------------- | ------------------- |
| sm       | `rgba(0, 0, 0, 0.06) 0px 2px 4px 0px`   | `--shadow-sm`       |
| subtle   | `rgba(0, 0, 0, 0.1) 0px 1px 2px 0px`    | `--shadow-subtle`   |
| subtle-2 | `rgba(0, 0, 0, 0.04) 0px 1px 2px 0px`   | `--shadow-subtle-2` |
| subtle-3 | `rgba(0, 0, 0, 0.08) 0px 2px 3px 0px`   | `--shadow-subtle-3` |
| xl       | `rgba(0, 0, 0, 0.25) 0px 14px 32px 0px` | `--shadow-xl`       |

### Layout

- **Card padding:** 16px
- **Element gap:** 4-16px

## Components

### Primary Filled Button

**Role:** Interactive element

Solid Blueprint Blue background (#0b64e9), white text (#ffffff), 8px border radius, 12px vertical padding, 12-16px horizontal padding. Prominently signals primary actions.

### Secondary Outlined Button

**Role:** Interactive element

Subtle Gray background (#f0efef), Blueprint Blue text (#0000ee - browser default, inferred brand blue of #0b64e9), with a 1px border matching the text color or Blueprint Blue if no border color is specified. 8px border radius, 8px vertical padding, 12px horizontal padding. Used for less prominent actions.

### Text Link

**Role:** Navigation/Interactive text

Blueprint Blue text (#0b64e9, although data shows browser default #0000ee for links), typically Geist font family. Used for in-line navigation and clickable text.

### Header Navigation Item

**Role:** Global Navigation

Typically Geist font, weight 400, size 14px, #6b6561 text transforming to #000000 on hover. Simple text link for top-level navigation.

### Display Headline - 'The Grand Statement'

**Role:** Hero content

FH Total Display Regular, 183px, lineHeight 0.8, color #1c1917, typically followed by a muted equivalent at 106px in #d4d2d1, creating a layered, emphasized headline effect for hero sections.

### Eyebrow Label

**Role:** Section/field categorization label

The canonical micro-label above or beside content. System font, micro size (10px), weight 500, uppercase, 0.15em letter-spacing, Text Muted (#a6a09b). Defined once in `@pulse/ui` as `.eyebrow` (components layer).

Modifiers: `.eyebrow--caption` (12px caption size, for lower-density contexts), `.eyebrow--strong` (weight 600), `.eyebrow--subtle` (Text Subtle #57534d), `.eyebrow--blue` (Blueprint Blue #0b64e9, for section markers under page headers), `.eyebrow--inherit` (`color: inherit`, for labels inside tinted containers whose tone must follow the ancestor instead of the muted default).

Rare one-off tones (status colors, translucent blues) are applied as call-site color utilities layered over the base — they override the component color because utilities outrank the components layer.

**Never** hand-roll the combo with utilities (`text-micro uppercase tracking-[0.15em] …`) — use the class so tracking, weight, and size stay governed in one place.

## Do's and Don'ts

### Do

- Use 'FH Total Display Regular' solely for hero-level headlines (106px, 183px) to establish brand gravitas; reserve serif usage for maximum impact.
- Apply 'Blueprint Blue' (#0b64e9) exclusively for primary calls-to-action and active states to maintain clear visual hierarchy.
- Employ the '#f5f5f4' 'Page Canvas' for all primary page backgrounds to ensure an expansive, clean aesthetic.
- Utilize Geist font with a -0.02em letter-spacing for all body text and subheadings to maintain the distinct digital typography.
- Standardize on 6px default radii for all general elements and 8px for buttons, except for pill shapes which use 100px.
- Always use 'Text Primary' (#0c0a09) for main body copy and 'Text Secondary' (#1c1917) for sub-content on light backgrounds for optimal contrast.

### Don't

- Do not use multiple saturated colors for primary interactive elements; Blueprint Blue (#0b64e9) serves as the singular brand identifier.
- Avoid strong, heavy drop shadows; instead, use subtle shadows like rgba(0, 0, 0, 0.06) 0px 2px 4px 0px for minimal elevation.
- Do not use generic system fonts for prominent headings; FH Total Display Regular is reserved for brand distinction.
- Refrain from using color to signify hierarchy on text elements; instead, rely on font weights, sizes, and the specified neutral color scale (Text Primary, Secondary, Muted).
- Do not introduce new border radii beyond 1px, 6px, 8px, 12px, 16px, 20px, 30px, 36px, and 100px to maintain consistent geometric rhythm.

## Elevation

- **Card Container:** `rgba(0, 0, 0, 0.06) 0px 2px 4px 0px`
- **Card Container (subtle):** `rgba(0, 0, 0, 0.1) 0px 1px 2px 0px`
- **Button:** `rgba(0, 0, 0, 0.04) 0px 1px 2px 0px, rgba(0, 0, 0, 0.08) 0px 2px 3px 0px`
- **Link with high elevation:** `rgba(0, 0, 0, 0.25) 0px 14px 32px 0px`

## Imagery

The visual language is primarily UI-focused, featuring crisp product screenshots and abstract, geometric graphics. Product screenshots are typically contained within device mockups or simple rectangular frames, presenting the software functionality clearly. There's an absence of traditional photography or complex illustrations. Iconography is minimalist, outlined or filled in monochrome or brand blue, serving mostly as functional cues. The density of imagery is balanced, supporting the textual content rather than dominating it, aiming for explanatory clarity over decorative atmosphere. There are small, scattered instances of vivid color (yellow, red, orange, violet) used in elements that appear as status indicators or small data points, implying a data visualization or tagging purpose.

## Layout

The page primarily uses a max-width contained layout, likely centered, though specific max-width is not defined. The hero section features a prominent, centered display headline over a clean 'Page Canvas' background. Sections are generally vertically stacked with visible spacing, creating a spacious feel. Content arrangement often appears as a centered stack or a simple column with text-heavy information. There are instances of multi-column arrangements, such as a feature list or a card grid, but the overall presentation emphasizes clear, uncongested blocks of information. The navigation is a standard top bar, sticky or otherwise. The second screenshot shows a contained application UI with tabs and internal card-like structures, indicating an application-like interface.

## Agent Prompt Guide

1. **Quick Color Reference:**
   - Text Primary: #0c0a09
   - Page Background: #f5f5f4
   - CTA Blue: #0b64e9
   - Surface White: #ffffff
   - Text Muted: #6b6561

2. **Example Component Prompts:**
   - Create a primary filled button: Blueprint Blue background (#0b64e9), white text (#ffffff), 8px radius, with 12px vertical padding and 16px horizontal padding. Text in Geist, 16px, weight 500.
   - Generate a card container: Surface White background (#ffffff), 6px radius, with a subtle shadow (rgba(0, 0, 0, 0.1) 0px 1px 2px 0px). Content padding 16px.
   - Design a hero section headline: 'Revenue.' in FH Total Display Regular, 183px, weight 400, color #1c1917, lineHeight 0.8. Below it, 'On autopilot.' in FH Total Display Regular, 106px, weight 400, color #d4d2d1, lineHeight 0.8.
   - Produce a status tag: Status Red background (#f24149), white text, 6px radius, small padding (e.g., 4px vertical, 8px horizontal). Text in system-ui, 12px, weight 400.
   - Create a secondary outlined button: Subtle Gray background (#f0efef), Blueprint Blue text (#0b64e9), 1px border in Blueprint Blue, 8px radius, 8px vertical padding, 12px horizontal padding. Text in Geist, 14px, weight 400.

## Similar Brands

- **Linear** — Shares a clean, high-contrast, minimalist UI with a strong focus on typography and subtle use of a single accent color (blue/purple) on predominantly white-gray backgrounds.
- **Stripe** — Employs a sophisticated yet simple aesthetic, combining modern sans-serifs with strategic use of whites, grays, and a distinct primary brand color for interactive elements, presenting complex financial data clearly.
- **Vercel** — Features a similar developer-tool aesthetic with a focus on sharp typography, precise spacing, and a pragmatic use of elevation and subtle grays, often with a dedicated brand accent.
- **Superhuman** — Known for its highly polished, almost stark white interface, prioritizing function and information hierarchy through meticulous typography and minimal, effective color accents.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-page-canvas: #f5f5f4;
  --color-surface-white: #ffffff;
  --color-blueprint-blue: #0b64e9;
  --color-text-primary: #0c0a09;
  --color-text-secondary: #1c1917;
  --color-text-muted: #6b6561;
  --color-text-subtle: #57534d;
  --color-text-on-bright: #0c0a09;
  --color-subtle-gray: #ececea;
  --color-border-light: #f0efef;
  --color-disabled-gray: #d4d2d1;
  --color-status-red: #f24149;
  --color-status-orange: #f97006;
  --color-status-yellow: #f9b703;
  --color-status-violet: #6b4aff;

  /* Typography — Font Families */
  --font-fh-total-display-regular:
    'FH Total Display Regular', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
    'Segoe UI', Roboto, sans-serif;
  --font-geist:
    'Geist', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    sans-serif;
  --font-system-ui:
    'system-ui', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    sans-serif;
  --font-sans-serif:
    'sans-serif', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    sans-serif;

  /* Typography — Scale (rem-based; Tailwind v4 --text-* / --text-*--line-height namespace) */
  --text-micro: 0.625rem;
  --text-micro--line-height: 1.4;
  --text-caption: 0.6875rem;
  --text-caption--line-height: 1.45;
  --text-meta: 0.75rem;
  --text-meta--line-height: 1.5;
  --text-body: 0.8125rem;
  --text-body--line-height: 1.55;
  --text-body-lg: 0.875rem;
  --text-body-lg--line-height: 1.55;
  --text-subheading: 1rem;
  --text-subheading--line-height: 1.4;
  --text-heading: 1.125rem;
  --text-heading--line-height: 1.3;
  --text-heading-lg: 1.25rem;
  --text-heading-lg--line-height: 1.25;
  --text-display-sm: 1.5rem;
  --text-display-sm--line-height: 1.2;
  --text-display: 1.75rem;
  --text-display--line-height: 1.15;
  --text-display-lg: 2.25rem;
  --text-display-lg--line-height: 1.1;
  /* Hero band (landing display). Kept as vars; converted px → rem. */
  --text-hero-headline-1: 6.625rem;
  --text-hero-headline-1--line-height: 0.8;
  --text-hero-headline-2: 11.4375rem;
  --text-hero-headline-2--line-height: 0.8;

  /* Typography — Weights */
  --font-weight-regular: 400;
  --font-weight-medium: 500;

  /* Spacing */
  --spacing-unit: 4px;
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-36: 36px;
  --spacing-40: 40px;
  --spacing-44: 44px;
  --spacing-80: 80px;
  --spacing-120: 120px;
  --spacing-140: 140px;

  /* Layout */
  --card-padding: 16px;
  --element-gap: 4-16px;

  /* Border Radius */
  --radius-sm: 1px;
  --radius-md: 6px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
  --radius-2xl-2: 20px;
  --radius-3xl: 30px;
  --radius-3xl-2: 36px;
  --radius-full: 100px;
  --radius-full-2: 220px;

  /* Named Radii */
  --radius-pill: 100px;
  --radius-large: 12px;
  --radius-buttons: 8px;
  --radius-default: 6px;

  /* Shadows */
  --shadow-sm: rgba(0, 0, 0, 0.06) 0px 2px 4px 0px;
  --shadow-subtle: rgba(0, 0, 0, 0.1) 0px 1px 2px 0px;
  --shadow-subtle-2: rgba(0, 0, 0, 0.04) 0px 1px 2px 0px;
  --shadow-subtle-3: rgba(0, 0, 0, 0.08) 0px 2px 3px 0px;
  --shadow-xl: rgba(0, 0, 0, 0.25) 0px 14px 32px 0px;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-page-canvas: #f5f5f4;
  --color-surface-white: #ffffff;
  --color-blueprint-blue: #0b64e9;
  --color-text-primary: #0c0a09;
  --color-text-secondary: #1c1917;
  --color-text-muted: #6b6561;
  --color-text-subtle: #57534d;
  --color-text-on-bright: #0c0a09;
  --color-subtle-gray: #ececea;
  --color-border-light: #f0efef;
  --color-disabled-gray: #d4d2d1;
  --color-status-red: #f24149;
  --color-status-orange: #f97006;
  --color-status-yellow: #f9b703;
  --color-status-violet: #6b4aff;

  /* Typography */
  --font-fh-total-display-regular:
    'FH Total Display Regular', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
    'Segoe UI', Roboto, sans-serif;
  --font-geist:
    'Geist', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    sans-serif;
  --font-system-ui:
    'system-ui', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    sans-serif;
  --font-sans-serif:
    'sans-serif', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    sans-serif;

  /* Typography — Scale (rem-based; Tailwind v4 --text-* / --text-*--line-height namespace) */
  --text-micro: 0.625rem;
  --text-micro--line-height: 1.4;
  --text-caption: 0.6875rem;
  --text-caption--line-height: 1.45;
  --text-meta: 0.75rem;
  --text-meta--line-height: 1.5;
  --text-body: 0.8125rem;
  --text-body--line-height: 1.55;
  --text-body-lg: 0.875rem;
  --text-body-lg--line-height: 1.55;
  --text-subheading: 1rem;
  --text-subheading--line-height: 1.4;
  --text-heading: 1.125rem;
  --text-heading--line-height: 1.3;
  --text-heading-lg: 1.25rem;
  --text-heading-lg--line-height: 1.25;
  --text-display-sm: 1.5rem;
  --text-display-sm--line-height: 1.2;
  --text-display: 1.75rem;
  --text-display--line-height: 1.15;
  --text-display-lg: 2.25rem;
  --text-display-lg--line-height: 1.1;
  /* Hero band (landing display). Kept as vars; converted px → rem. */
  --text-hero-headline-1: 6.625rem;
  --text-hero-headline-1--line-height: 0.8;
  --text-hero-headline-2: 11.4375rem;
  --text-hero-headline-2--line-height: 0.8;

  /* Spacing */
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-36: 36px;
  --spacing-40: 40px;
  --spacing-44: 44px;
  --spacing-80: 80px;
  --spacing-120: 120px;
  --spacing-140: 140px;

  /* Border Radius */
  --radius-sm: 1px;
  --radius-md: 6px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
  --radius-2xl-2: 20px;
  --radius-3xl: 30px;
  --radius-3xl-2: 36px;
  --radius-full: 100px;
  --radius-full-2: 220px;

  /* Shadows */
  --shadow-sm: rgba(0, 0, 0, 0.06) 0px 2px 4px 0px;
  --shadow-subtle: rgba(0, 0, 0, 0.1) 0px 1px 2px 0px;
  --shadow-subtle-2: rgba(0, 0, 0, 0.04) 0px 1px 2px 0px;
  --shadow-subtle-3: rgba(0, 0, 0, 0.08) 0px 2px 3px 0px;
  --shadow-xl: rgba(0, 0, 0, 0.25) 0px 14px 32px 0px;
}
```
