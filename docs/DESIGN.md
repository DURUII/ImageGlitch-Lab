# ImageGlitch Design System

Reference: [ToyFight.co](https://toyfight.co) - Awwwards Site of the Day (June 2024)

---

## CRITICAL RULES

### MUST NOT USE EMOJI

- No emoji in UI text, buttons, labels, or any user-facing content
- Use text labels, icons (SVG), or symbols instead
- Example: Use "UPLOAD" not "Upload" with camera emoji

---

## 1. Color System

### Primary Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--black` | `#000000` | Primary background |
| `--white` | `#FFFFFF` | Primary text, borders |
| `--gray-900` | `#171717` | Borders, dividers |
| `--gray-800` | `#262626` | Secondary borders |
| `--gray-600` | `#525252` | Muted text |
| `--gray-500` | `#737373` | Disabled states |
| `--gray-400` | `#A3A3A3` | Placeholder text |

### Accent Colors (Subject Markers Only)

```
#FFFFFF  - Subject 1 (White)
#00FF00  - Subject 2 (Green)
#FF00FF  - Subject 3 (Magenta)
#00FFFF  - Subject 4 (Cyan)
#FFFF00  - Subject 5 (Yellow)
```

### Design Principle

- Black background, white text as default
- Minimal color usage - only for functional distinction
- High contrast for accessibility

---

## 2. Typography System

### Font Stack

```css
--font-sans: 'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif;
--font-mono: 'Space Mono', 'SF Mono', Consolas, monospace;
```

### Type Scale

| Level | Size | Weight | Line Height | Letter Spacing | Usage |
|-------|------|--------|-------------|----------------|-------|
| Display XL | `clamp(3rem, 10vw, 8rem)` | 700 | 0.95 | -0.03em | Hero titles |
| Display LG | `clamp(2rem, 6vw, 4rem)` | 700 | 1.0 | -0.02em | Section titles |
| Display MD | `clamp(1.5rem, 4vw, 2.5rem)` | 600 | 1.1 | -0.01em | Subsection titles |
| Text LG | `1.125rem` (18px) | 400 | 1.5 | 0 | Lead paragraphs |
| Text MD | `1rem` (16px) | 400 | 1.5 | 0 | Body text |
| Text SM | `0.875rem` (14px) | 400 | 1.5 | 0 | Secondary text |
| Text XS | `0.75rem` (12px) | 500 | 1.5 | 0.05em | Labels, captions |

### Typography Rules

1. **ALL CAPS** for navigation, labels, buttons, step titles
2. **Monospace** for technical labels, numbers, timestamps
3. **Tight line-height** (0.9-1.0) for display text
4. **Wide letter-spacing** (0.05-0.1em) for small caps text

---

## 3. Spacing System

### Base Unit: 8px

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | 4px | Tight gaps |
| `--space-2` | 8px | Icon gaps, small padding |
| `--space-3` | 12px | List item gaps |
| `--space-4` | 16px | Component padding |
| `--space-6` | 24px | Section gaps |
| `--space-8` | 32px | Large gaps |
| `--space-12` | 48px | Section padding |
| `--space-16` | 64px | Page padding |

### Container

```css
max-width: 1400px;
padding: 0 24px;        /* Mobile */
padding: 0 48px;        /* Desktop */
```

---

## 4. Motion System

### Easing Functions

```css
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);   /* Primary - fast start, slow end */
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);    /* Symmetric transitions */
--ease-linear: linear;                             /* Progress bars only */
```

### Duration Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--duration-fast` | 150ms | Hover states, micro-interactions |
| `--duration-normal` | 300ms | Standard transitions |
| `--duration-slow` | 500ms | Page transitions, reveals |
| `--duration-slower` | 800ms | Complex animations |

### Animation Patterns

#### Fade In Up (Entry)
```css
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
/* Usage: 0.6s ease-out-expo, stagger 0.1s between elements */
```

#### Hover Glitch (Text)
```css
@keyframes glitchText {
  0%   { transform: translate(0); }
  20%  { transform: translate(-2px, 2px); }
  40%  { transform: translate(-2px, -2px); }
  60%  { transform: translate(2px, 2px); }
  80%  { transform: translate(2px, -2px); }
  100% { transform: translate(0); }
}
/* Usage: 0.3s on hover, ease-in-out */
```

#### Underline Reveal (Links)
```css
.link::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 0;
  height: 1px;
  background: var(--white);
  transition: width 0.3s var(--ease-out-expo);
}
.link:hover::after {
  width: 100%;
}
```

#### Slot Machine Text (Word Rotation)
- Container with `overflow: hidden`
- Stack of words translated vertically
- Animate `translateY` to cycle through words
- Width transitions smoothly to match current word length

#### Staggered Entry
```css
.item { 
  animation: fadeInUp 0.6s var(--ease-out-expo) forwards;
  opacity: 0;
}
.item:nth-child(1) { animation-delay: 0.0s; }
.item:nth-child(2) { animation-delay: 0.1s; }
.item:nth-child(3) { animation-delay: 0.2s; }
```

#### Mask Outline Breathing (Sample)
Purpose: keep the selection feeling alive without heavy interaction. Use a subtle pulse and soft glow.
```css
.maskOutline {
  opacity: 0.9;
  mix-blend-mode: screen;
  filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.6))
    drop-shadow(0 0 14px rgba(255, 255, 255, 0.35));
  animation: outlinePulse 1.8s var(--ease-out-expo) infinite;
}

@keyframes outlinePulse {
  0% { opacity: 0.7; }
  50% { opacity: 1; }
  100% { opacity: 0.7; }
}
```

---

## 5. Sound Design

### Implementation

- Use **Web Audio API (AudioContext)** for low-latency playback
- Preload audio buffers on user interaction (click/touch)
- Provide global mute toggle

### Sound Types

| Trigger | Sound | Duration | Description |
|---------|-------|----------|-------------|
| Link/Button Hover | Tick | 50-80ms | Short mechanical click |
| Button Click | Clack | 80-120ms | Heavier confirmation sound |
| Step Complete | Chime | 150-200ms | Subtle success tone |
| Error | Buzz | 100ms | Low-frequency error feedback |

### Audio Specifications

- Format: MP3 (fallback: WAV)
- Sample Rate: 44.1kHz
- Bit Depth: 16-bit
- Volume: -12dB to -6dB (subtle, not intrusive)

### User Preference

```typescript
// Respect user preference, default to OFF
const [soundEnabled, setSoundEnabled] = useState(false)

// Only enable after explicit user action
const enableSound = () => {
  audioContext.resume()
  setSoundEnabled(true)
}
```

---

## 6. Component Patterns

### Buttons

```
PRIMARY:    White bg, black text, white border
            Hover: Transparent bg, white text
            
SECONDARY:  Transparent bg, white text, gray-800 border
            Hover: white border
            
GHOST:      Transparent bg, gray-500 text, no border
            Hover: white text
```

### Form Elements

- Minimal styling - borders only on bottom or all sides
- 1px border, gray-800 default, white on focus
- No rounded corners (or max 4px)

### Cards/Panels

- 1px border, gray-900
- No background (transparent) or gray-950
- No shadows
- No rounded corners (or max 4px)

---

## 7. Layout Principles

### Grid System

- 12-column grid on desktop
- Single column on mobile
- Gutter: 24px

### Hierarchy

1. **Generous whitespace** - Let content breathe
2. **Left-aligned text** - Avoid center alignment except for hero
3. **Asymmetric layouts** - Avoid perfect symmetry
4. **Content density** - Sparse, not cramped

### Responsive Breakpoints

```css
--breakpoint-sm: 640px;
--breakpoint-md: 768px;
--breakpoint-lg: 1024px;
--breakpoint-xl: 1280px;
```

---

## 8. Iconography

### Rules

- Use SVG icons only
- Stroke-based, 1.5px stroke weight
- Monochrome (currentColor)
- Size: 16px, 20px, 24px

### When to Use Icons

- Navigation affordances (arrows, close)
- Status indicators (loading, complete, error)
- Actions (play, pause, upload)

### When NOT to Use Icons

- Decorative purposes
- Alongside text labels (text is sufficient)
- As emoji replacements

---

## 9. Accessibility

### Contrast

- Text on black: minimum 7:1 ratio (AAA)
- Interactive elements: visible focus states

### Motion

- Respect `prefers-reduced-motion`
- Provide pause controls for animations

### Audio

- Default to muted
- Visual feedback for all audio cues

---

## 10. Brand Voice (UI Copy)

### Tone

- Technical, direct, minimal
- ALL CAPS for emphasis
- No punctuation in labels
- No emoji (critical rule)

### Examples

```
Good:                    Bad:
UPLOAD                   Upload your photo
SELECT SUBJECTS          Click to select subjects
CONTINUE                 Next Step ->
BACK                     Go Back
EXPORT                   Export Your Video
```

---

## References

- [ToyFight.co](https://toyfight.co) - Primary visual reference
- [Codrops Case Study](https://tympanus.net/codrops/2024/06/11/case-study-toyfight-2024/) - Technical breakdown
- Tech Stack: Next.js, GSAP, React Three Fiber, Web Audio API
