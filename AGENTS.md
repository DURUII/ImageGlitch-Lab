# ImageGlitch

**Web-based Glitch Art Video Generator with "Power-On" Effect**

## Core Concept

Transform static photos into dynamic videos where subjects light up sequentially, creating an "electrocuted" visual effect synced with music rhythm.

## Workflow

```
UPLOAD -> SELECT -> EXPORT
```

### 1. UPLOAD
- Drag & drop or click to upload images (JPG/PNG/WEBP)
- Sample images available for quick testing

### 2. SELECT (Core Interaction)
- **Left-click**: Add positive point → generate mask → auto-number ①
- **Right-click**: Add negative point → exclude area
- **Continue clicking**: Add more subjects (②③④...)
- **Drag to reorder**: Adjust power-on sequence in sidebar
- **Shortcuts**: Cmd+Z / Cmd+Shift+Z / Enter

### 3. EXPORT
- **Glitch Presets**: SOLID COLOR / BRIGHTENED
- **Audio Track**: Built-in BGM options
- **Format**: MP4 / GIF / Live Photo

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 + React 18 |
| ML Model | Transformers.js + SAM (slimsam-77-uniform) |
| 3D/WebGL | Three.js + React Three Fiber + @react-three/postprocessing |
| Styling | CSS Modules |
| Architecture | Browser-local + Web Worker |

## Key Files

| Path | Purpose |
|------|---------|
| `app/[locale]/page.tsx` | Effect Hub homepage with animated route cards |
| `app/[locale]/flash-photo/page.tsx` | Flash Photo - power-on effect generator |
| `app/[locale]/lidar/page.tsx` | LiDAR point cloud visualization |
| `components/ui/Dither.tsx` | WebGL-powered dither effect component |
| `hooks/useSAM.ts` | SAM model wrapper |
| `hooks/useSharedUpload.ts` | Shared upload flow across routes |

## Design Guidelines\

> You may refer to [./docs/DESIGN.md] for more details.

- No emojis in UI (use text labels or SVG icons)
- Black background + white text, functional colors only for subject markers
- Typography: Space Grotesk (Sans) / Space Mono (Mono)
- ALL CAPS for navigation/labels
- Animation curve: `--ease-out-expo`

## Development Status

> You must maintain the TODO list here.

- [x] the core segmentation algorithm has been implemented
- [x] the ux needs major redesign (upload state power-on pass 1)
- [x] further ux polish (select + export screens)
- [x] homepage upgraded into effect hub with reusable shared upload across flash-photo and lidar routes
- [x] liDAR point cloud visualization with 3D rendering
- [x] dither effect migrated to WebGL
