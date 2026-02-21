# ImageGlitch / Easy-FlashPhoto

<!-- CO-OP TRANSLATOR LANGUAGES TABLE START -->
[English](./README.md) | [简体中文](./README_ZH.md)
<!-- CO-OP TRANSLATOR LANGUAGES TABLE END -->

An **Effect Hub** for AI-powered image/video effects. Currently supports Flash Photo ("Power-On" effect) and LiDAR point cloud visualization.

[![Demo](https://img.youtube.com/vi/13qqnk1zcVQ/0.jpg)](https://youtu.be/13qqnk1zcVQ?t=18s)

## Features

### 1. Flash Photo

Transform static photos into dynamic **"Electric-style"** videos. Elements in the photo light up sequentially, as if electrodes were connected.

1. **Upload**: Drag & drop your image into this **Next.js 14** app.
2. **Select**: Click to segment via **Transformers.js (SAM)**. 100% Local.
3. **Glitch**: Drag to reorder the sequence.
4. **Export**: Render MP4/GIF instantly with **FFmpeg.wasm**.

### 2. LiDAR

Visualize depth information from LiDAR scans with interactive 3D point cloud rendering.

- **Upload**: Support for depth maps and LiDAR data
- **Visualize**: Interactive 3D point cloud with Three.js
- **Export**: Zipped overlay/render outputs

## Setup

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).
