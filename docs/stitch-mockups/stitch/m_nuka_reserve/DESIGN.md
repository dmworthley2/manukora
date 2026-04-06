# Design System Document: Precision Organics

## 1. Overview & Creative North Star
**Creative North Star: The Scientific Estate**
This design system moves beyond "natural" honey tropes. It is an intersection of raw New Zealand wilderness and clinical, high-end precision. We are building a "Scientific Estate"—an experience that feels as curated as a gallery and as meticulous as a laboratory.

To achieve this, the system rejects standard web layouts. We embrace **Editorial Asymmetry**, where whitespace is treated as a physical element, and **Tonal Depth**, where the UI is built from layers of "fine paper" rather than digital boxes. This is a high-end DTC experience that prioritizes "breathing room" and tactile sophistication over information density.

---

## 2. Colors: The Tonal Landscape
Our palette is rooted in the earth but refined by light. We use a sophisticated range of creams and honey golds to create warmth without "yellowing" the brand.

### The "No-Line" Rule
**Explicit Instruction:** 1px solid borders are strictly prohibited for sectioning. Structural boundaries must be defined solely through background color shifts.
*   *Example:* Use `surface-container-low` (#f7f3e9) for a product section sitting on a `background` (#fdf9ef). The change in tone is the divider.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. Use the surface tiers to create "nested" importance:
1.  **Base Layer:** `surface` (#fdf9ef) – The foundation of the page.
2.  **Sectional Layer:** `surface-container-low` (#f7f3e9) – Defines large content areas.
3.  **Interactive Layer:** `surface-container-highest` (#e6e2d8) – For active states or emphasized cards.

### The "Glass & Gradient" Rule
To elevate the "Precision Organics" feel:
*   **Signature Textures:** Use subtle linear gradients for CTAs, transitioning from `primary` (#775a00) to `primary-container` (#f6be00) at a 45-degree angle. This mimics the translucent, refractive quality of honey.
*   **Glassmorphism:** For floating navigation or modals, use `surface` at 80% opacity with a `20px` backdrop-blur. This ensures the organic background colors bleed through, softening the interface.

---

## 3. Typography: Editorial Authority
The type system pairs the intellectual rigor of a serif with the modern clarity of a sans-serif.

*   **Display & Headlines (Newsreader):** Use for storytelling and "Precision" statements. The serif adds a sense of heritage and New Zealand "estate" quality.
*   **Titles, Body, & Labels (Manrope):** Use for technical data, product specs, and functional UI. It provides the "Scientific" balance to the serif.

**Hierarchy as Identity:** 
Always lean into high contrast. A `display-lg` headline should often be paired with a `label-md` caption to create an intentional, editorial "gap" that feels expensive and considered.

---

## 4. Elevation & Depth: Tonal Layering
We do not use shadows to mimic "floating" objects; we use color to mimic "physical weight."

*   **The Layering Principle:** Place a `surface-container-lowest` (#ffffff) card on a `surface-container-low` (#f7f3e9) section. This creates a soft, natural lift that feels like a sheet of paper resting on a desk.
*   **Ambient Shadows:** If a floating effect is mandatory (e.g., a sticky cart button), use an extra-diffused shadow: `box-shadow: 0 10px 40px rgba(79, 70, 50, 0.06);`. Notice we use a tint of `on-surface-variant` rather than black.
*   **The "Ghost Border" Fallback:** If accessibility requires a border, use `outline-variant` (#d3c5ab) at 15% opacity. Never use 100% opacity borders.

---

## 5. Components: Refined Primitives

### Buttons
*   **Primary:** Gradient from `primary` to `primary-container`. `radius-sm` (0.125rem) for a sharp, precision look. Text in `on-primary`.
*   **Secondary:** `surface-container-highest` background with `on-surface` text. No border.
*   **Tertiary:** Text-only in `primary`, using `label-md` (All Caps, letter-spacing: 0.05em).

### Cards & Lists
*   **Constraint:** Forbid divider lines.
*   **Execution:** Use vertical white space from the spacing scale (e.g., `2rem` between items) or a subtle shift to `surface-container-low` for alternating list items.

### Input Fields
*   **Style:** Minimalist. Underline-only or a very soft `surface-container-high` background.
*   **Focus State:** Transition the background to `surface-container-highest` and the label to `primary`.

### Precision Components (App Context)
*   **Batch Origin Chips:** Small, `label-sm` elements using `tertiary-container` backgrounds to highlight the MGO rating or hive location.
*   **Laboratory Progress Steppers:** Use thin `primary` lines and `surface-container-highest` nodes to visualize the honey's journey from hive to jar.

---

## 6. Do's and Don'ts

### Do:
*   **Do** use asymmetrical margins. A product image might be flush to the left, while text is centered in the right column.
*   **Do** lean into the "Honey Gold" (`primary-container`) sparingly as a highlight, not a background.
*   **Do** use `Newsreader` for any text that is meant to be "felt" and `Manrope` for any text meant to be "read."

### Don't:
*   **Don't** use standard "Material Design" shadows. They feel too "software" for an organic brand.
*   **Don't** use pure black (#000000). Use `on-surface` (#1c1c16) for all dark text to maintain the "warm cream" atmosphere.
*   **Don't** crowd the interface. If a screen feels full, it is no longer premium. Increase the `surface` spacing.