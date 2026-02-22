'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import { zipSync } from 'fflate'
import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import TopBar from '@/components/TopBar'
import Footer from '@/components/Footer'
import ExportModal from '@/components/ExportModal'
import { useSharedUpload } from '@/hooks/useSharedUpload'
import { IMAGE_UPLOAD_ACCEPT, imageFileToDataUrl } from '@/lib/imageUpload'
import styles from './lidar.module.css'

const DEFAULT_LIDAR_IMAGE = '/examples/apple.jpg'
const EXPORT_MAX_SIDE = 1920
const EXPORT_FPS = 20
const EXPORT_SECONDS = 3
const MAX_PREVIEW_DPR = 2
const LIDAR_SETTINGS_STORAGE_KEY = 'imageglitch:lidar:settings:v1'

const THEMES = {
  cyan: { name: 'QUANTUM CYAN', r: 0, g: 255, b: 240 },
  crimson: { name: 'INFRA RED', r: 255, g: 50, b: 50 },
  matrix: { name: 'MATRIX GREEN', r: 50, g: 255, b: 100 },
} as const

type ThemeKey = keyof typeof THEMES
type ActiveSpectrum = ThemeKey | 'custom'
type ExportMode = 'overlay' | 'composite'
type ExportType = 'overlay' | 'render'
type ModalExportFormat = 'mp4' | 'gif' | 'cutout'

type LidarSettings = {
  blockSize: number
  speed: number
  thickness: number
  depth: number
  density: number
  edgeFocus: number
  bgDarken: number
}

type LidarBlock = {
  baseX: number
  baseY: number
  r: number
  g: number
  b: number
  brightness: number
  edge: number
  noise: number
}

type SceneData = {
  blocks: LidarBlock[]
  imgW: number
  imgH: number
  offsetX: number
  offsetY: number
}

type BuiltFrames = {
  frames: Uint8ClampedArray[]
  width: number
  height: number
  delayMs: number
  durationSeconds: number
  encodeProgressStart: number
  encodeProgressEnd: number
}

const defaultSettings: LidarSettings = {
  density: 0.25,
  edgeFocus: 5,
  depth: 1200,
  thickness: 100,
  speed: 3,
  bgDarken: 0.15,
  blockSize: 6,
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const normalizeLidarSettings = (raw: Partial<LidarSettings> | null | undefined): LidarSettings => {
  return {
    density: clamp(Number(raw?.density ?? defaultSettings.density), 0.05, 1),
    edgeFocus: clamp(Number(raw?.edgeFocus ?? defaultSettings.edgeFocus), 0, 10),
    depth: clamp(Number(raw?.depth ?? defaultSettings.depth), 0, 2200),
    thickness: clamp(Number(raw?.thickness ?? defaultSettings.thickness), 40, 260),
    speed: clamp(Number(raw?.speed ?? defaultSettings.speed), 0.8, 8),
    bgDarken: clamp(Number(raw?.bgDarken ?? defaultSettings.bgDarken), 0, 0.95),
    blockSize: clamp(Number(raw?.blockSize ?? defaultSettings.blockSize), 4, 16),
  }
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('FAILED TO LOAD IMAGE'))
    img.src = src
  })

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noopener'
  a.style.display = 'none'
  const ios = isIOSFamilyDevice()
  if (ios) {
    a.target = '_blank'
    // Keep filename hint for browsers that still honor download on iOS.
    a.download = filename
  } else {
    a.download = filename
  }
  document.body.appendChild(a)
  a.click()
  window.setTimeout(() => {
    a.remove()
    URL.revokeObjectURL(url)
  }, 60_000)
}

type ExportShareFile = {
  name: string
  blob: Blob
}

const shareFilesIfPossible = async (files: ExportShareFile[], title: string): Promise<'shared' | 'unsupported' | 'canceled'> => {
  if (!isIOSFamilyDevice() || typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof File !== 'function') {
    return 'unsupported'
  }

  const shareFiles = files.map(({ name, blob }) => new File([blob], name, { type: blob.type || inferMimeType(name) }))
  if (typeof navigator.canShare === 'function') {
    try {
      if (!navigator.canShare({ files: shareFiles })) {
        return 'unsupported'
      }
    } catch {
      return 'unsupported'
    }
  }

  try {
    await navigator.share({
      title,
      files: shareFiles,
    })
    return 'shared'
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    if (name === 'AbortError') {
      return 'canceled'
    }
    return 'unsupported'
  }
}

const deliverFiles = async (files: ExportShareFile[], title: string): Promise<'shared' | 'downloaded' | 'canceled'> => {
  const shareResult = await shareFilesIfPossible(files, title)
  if (shareResult === 'shared') return 'shared'
  if (shareResult === 'canceled') return 'canceled'
  files.forEach(({ name, blob }) => downloadBlob(blob, name))
  return 'downloaded'
}

const inferMimeType = (filename: string) => {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.mp4')) return 'video/mp4'
  if (lower.endsWith('.mov')) return 'video/quicktime'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.txt')) return 'text/plain;charset=utf-8'
  return 'application/octet-stream'
}

const hexToRgb = (hex: string) => {
  const value = hex.replace('#', '').trim()
  const safe = value.length === 6 ? value : '32ff64'
  return {
    r: Number.parseInt(safe.slice(0, 2), 16) || 50,
    g: Number.parseInt(safe.slice(2, 4), 16) || 255,
    b: Number.parseInt(safe.slice(4, 6), 16) || 100,
  }
}

const isIOSFamilyDevice = () => {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const legacyIOS = /iPad|iPhone|iPod/.test(ua)
  const touchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return legacyIOS || touchMac
}

const toUint8 = (data: Uint8Array | ArrayBuffer): Uint8Array => {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  return Uint8Array.from(bytes)
}

const noiseFromCoords = (x: number, y: number, width: number, height: number) => {
  const nx = x / Math.max(1, width)
  const ny = y / Math.max(1, height)
  const seed = Math.sin(nx * 91.345 + ny * 47.123 + (x + y) * 0.013) * 43758.5453123
  return seed - Math.floor(seed)
}

const buildLidarBlocks = (imageData: Uint8ClampedArray, imgW: number, imgH: number, blockSize: number): LidarBlock[] => {
  const getLuma = (index: number) => {
    if (index < 0 || index >= imageData.length) return 0
    return (imageData[index] * 0.299 + imageData[index + 1] * 0.587 + imageData[index + 2] * 0.114) / 255
  }

  const blocks: LidarBlock[] = []
  for (let y = 0; y < imgH; y += blockSize) {
    for (let x = 0; x < imgW; x += blockSize) {
      const idx = (y * imgW + x) * 4
      if (imageData[idx + 3] < 8) continue

      const brightness = getLuma(idx)
      let edge = 0
      if (x + blockSize < imgW && y + blockSize < imgH) {
        const right = (y * imgW + (x + blockSize)) * 4
        const bottom = ((y + blockSize) * imgW + x) * 4
        edge = Math.abs(brightness - getLuma(right)) + Math.abs(brightness - getLuma(bottom))
      }

      blocks.push({
        baseX: x,
        baseY: y,
        r: imageData[idx],
        g: imageData[idx + 1],
        b: imageData[idx + 2],
        brightness,
        edge,
        noise: noiseFromCoords(x, y, imgW, imgH),
      })
    }
  }

  return blocks
}

const getPreviewPixelRatio = (cssWidth: number, cssHeight: number) => {
  if (typeof window === 'undefined') return 1
  const raw = window.devicePixelRatio || 1
  const maxCssSide = Math.max(1, cssWidth, cssHeight)
  const cappedBySide = EXPORT_MAX_SIDE / maxCssSide
  return Math.max(1, Math.min(raw, MAX_PREVIEW_DPR, cappedBySide))
}

const getAlignedOverlayStartTimeMs = (
  nowMs: number,
  speed: number,
  sceneScale: number,
  drawImageH: number,
  depth: number
) => {
  const speedPerSec = Math.max(0.0001, speed) * 200 * sceneScale
  const cycle = Math.max(1, drawImageH + depth * sceneScale * 2 + 1000 * sceneScale)
  const rawNow = ((nowMs * 0.001 * speedPerSec) % cycle + cycle) % cycle
  // Align to the phase reset so the overlay starts with visible scan energy.
  const deltaRaw = (0 - rawNow + cycle) % cycle
  return nowMs + (deltaRaw / speedPerSec) * 1000
}

const getWaveCycleMs = (
  speed: number,
  sceneScale: number,
  drawImageH: number,
  depth: number
) => {
  const speedPerSec = Math.max(0.0001, speed) * 200 * sceneScale
  const cycle = Math.max(1, drawImageH + depth * sceneScale * 2 + 1000 * sceneScale)
  return (cycle / speedPerSec) * 1000
}

const estimateLidarActivityAtTimeMs = (
  scene: SceneData,
  settings: LidarSettings,
  sceneScale: number,
  timeMs: number
) => {
  const scaledDepth = settings.depth * sceneScale
  const scaledThickness = Math.max(1, settings.thickness * sceneScale)
  const t = timeMs * 0.001 * settings.speed
  const drawImageH = scene.imgH * sceneScale
  const wavePhase = (t * 200 * sceneScale) % (drawImageH + scaledDepth * 2 + 1000 * sceneScale) - 500 * sceneScale

  let score = 0
  const stride = Math.max(1, Math.floor(scene.blocks.length / 5000))
  for (let i = 0; i < scene.blocks.length; i += stride) {
    const block = scene.blocks[i]
    const survivalThreshold = settings.density + block.edge * settings.edgeFocus
    if (block.noise > survivalThreshold) continue

    const baseX = block.baseX * sceneScale
    const baseY = block.baseY * sceneScale
    const depthOffset = block.brightness * scaledDepth
    const patchNoise = Math.sin(baseX * 0.01 + t) * Math.cos(baseY * 0.01 - t) * (100 * sceneScale)
    const effectiveY = baseY - depthOffset + patchNoise
    const dist = Math.abs(effectiveY - wavePhase)
    if (dist >= scaledThickness) continue

    const intensity = 1 - dist / scaledThickness
    if (intensity > 0.08) score += intensity
  }
  return score
}

const findBestStartTimeMs = (
  nowMs: number,
  durationSeconds: number,
  scene: SceneData,
  settings: LidarSettings,
  sceneScale: number
) => {
  const drawImageH = scene.imgH * sceneScale
  const cycleMs = getWaveCycleMs(settings.speed, sceneScale, drawImageH, settings.depth)
  if (!Number.isFinite(cycleMs) || cycleMs <= 0) return nowMs

  const durationMs = durationSeconds * 1000
  const candidates = 14
  const sampleSteps = 10
  const alignedStart = getAlignedOverlayStartTimeMs(nowMs, settings.speed, sceneScale, drawImageH, settings.depth)
  let bestStart = alignedStart
  let bestScore = -1

  for (let c = 0; c < candidates; c += 1) {
    const candidateStart = alignedStart + (c / candidates) * cycleMs
    let score = 0
    for (let s = 0; s < sampleSteps; s += 1) {
      const ratio = sampleSteps <= 1 ? 0 : s / (sampleSteps - 1)
      const t = candidateStart + durationMs * ratio
      score += estimateLidarActivityAtTimeMs(scene, settings, sceneScale, t)
    }
    if (score > bestScore) {
      bestScore = score
      bestStart = candidateStart
    }
  }

  return bestStart
}

const drawLidarFrame = ({
  ctx,
  canvasWidth,
  canvasHeight,
  source,
  scene,
  settings,
  theme,
  timeMs,
  mode,
  drawOffsetX,
  drawOffsetY,
  drawImageW,
  drawImageH,
}: {
  ctx: CanvasRenderingContext2D
  canvasWidth: number
  canvasHeight: number
  source: HTMLImageElement
  scene: SceneData
  settings: LidarSettings
  theme: { r: number; g: number; b: number }
  timeMs: number
  mode: ExportMode
  drawOffsetX: number
  drawOffsetY: number
  drawImageW: number
  drawImageH: number
}) => {
  const scaleX = drawImageW / scene.imgW
  const scaleY = drawImageH / scene.imgH
  const avgScale = (scaleX + scaleY) * 0.5
  const blockSize = Math.max(2, Math.floor(settings.blockSize * avgScale))

  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)

  if (mode === 'composite') {
    ctx.drawImage(source, drawOffsetX, drawOffsetY, drawImageW, drawImageH)
    ctx.fillStyle = `rgba(0, 0, 0, ${settings.bgDarken})`
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)
  }

  ctx.globalCompositeOperation = 'lighter'

  const scaledDepth = settings.depth * scaleY
  const scaledThickness = Math.max(1, settings.thickness * scaleY)
  const t = timeMs * 0.001 * settings.speed
  const wavePhase = (t * 200 * scaleY) % (drawImageH + scaledDepth * 2 + 1000 * scaleY) - 500 * scaleY

  for (let i = 0; i < scene.blocks.length; i += 1) {
    const block = scene.blocks[i]
    const survivalThreshold = settings.density + block.edge * settings.edgeFocus
    if (block.noise > survivalThreshold) continue

    const baseX = block.baseX * scaleX
    const baseY = block.baseY * scaleY
    const depthOffset = block.brightness * scaledDepth
    const patchNoise = Math.sin(baseX * 0.01 + t) * Math.cos(baseY * 0.01 - t) * (100 * scaleY)
    const effectiveY = baseY - depthOffset + patchNoise
    const dist = Math.abs(effectiveY - wavePhase)

    if (dist >= scaledThickness) continue

    let intensity = 1 - dist / scaledThickness
    intensity *= intensity
    intensity *= 1 + block.edge * settings.edgeFocus * 2

    const flicker = Math.sin(timeMs * 0.022 + block.noise * 50 + block.baseX * 0.003)
    if (intensity > 0.5 && flicker > 0.72) {
      intensity *= 1.5
    }

    if (intensity <= 0.05) continue

    const finalR = (block.r * 0.3 + theme.r * 0.7) * intensity
    const finalG = (block.g * 0.3 + theme.g * 0.7) * intensity
    const finalB = (block.b * 0.3 + theme.b * 0.7) * intensity

    ctx.fillStyle = `rgb(${finalR | 0}, ${finalG | 0}, ${finalB | 0})`
    const size = blockSize * 0.8
    ctx.fillRect(drawOffsetX + baseX, drawOffsetY + baseY, size, size)
  }
}

export default function LidarPage({ params }: { params: { locale: string } }) {
  const { sharedImage, setSharedUpload } = useSharedUpload()

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const animationRef = useRef<number | null>(null)
  const ffmpegRef = useRef<FFmpeg | null>(null)
  const lastFrameTimeRef = useRef(0)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<HTMLImageElement | null>(null)
  const [scene, setScene] = useState<SceneData | null>(null)
  const [activeSpectrum, setActiveSpectrum] = useState<ActiveSpectrum>('matrix')
  const [customColor, setCustomColor] = useState('#32ff64')
  const [settings, setSettings] = useState<LidarSettings>(defaultSettings)
  const [settingsHydrated, setSettingsHydrated] = useState(false)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })

  const [isExportOpen, setIsExportOpen] = useState(false)
  const [exportFormats, setExportFormats] = useState<ModalExportFormat[]>(['mp4'])
  const [exportTypes, setExportTypes] = useState<ExportType[]>(['render'])
  const [exportBusy, setExportBusy] = useState(false)
  const [exportProgress, setExportProgress] = useState<number>(0)
  const [exportNote, setExportNote] = useState<string | null>(null)
  const [capturePreviewPercent, setCapturePreviewPercent] = useState<number | null>(null)

  const selectedTheme = activeSpectrum === 'custom' ? hexToRgb(customColor) : THEMES[activeSpectrum]

  const handleReplace = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const dataUrl = await imageFileToDataUrl(file)
      setSharedUpload(dataUrl)
    } catch (error) {
      console.error('Replace image failed:', error)
      let msg = 'UNKNOWN ERROR'
      if (error instanceof Error) {
        msg = error.message
      } else if (typeof error === 'string') {
        msg = error
      } else {
        try {
          msg = JSON.stringify(error)
        } catch {
          msg = String(error)
        }
      }
      setError(`FAILED: ${msg.slice(0, 50).toUpperCase()}`)
    } finally {
      setBusy(false)
    }
  }

  const openUploadPicker = useCallback(() => {
    const input = inputRef.current
    if (!input) return
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker()
        return
      } catch {
        // Fallback to click when showPicker is blocked.
      }
    }
    input.click()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMetaE = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'e'
      if (!isMetaE) return
      event.preventDefault()
      setIsExportOpen(true)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = window.localStorage.getItem(LIDAR_SETTINGS_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<LidarSettings>
        setSettings(normalizeLidarSettings(parsed))
      }
    } catch {
      // Ignore invalid local storage payloads.
    } finally {
      setSettingsHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (!settingsHydrated) return
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(LIDAR_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // Ignore storage write failures (private mode/quota).
    }
  }, [settings, settingsHydrated])

  useEffect(() => {
    let mounted = true

    const resolveSource = async () => {
      try {
        if (sharedImage) {
          const loaded = await loadImage(sharedImage)
          if (!mounted) return
          setSource(loaded)
          return
        }

        const example = await loadImage(DEFAULT_LIDAR_IMAGE)
        if (!mounted) return
        setSource(example)
        setError(null)
      } catch (err) {
        if (!mounted) return
        setSource(null)
        setError('FAILED TO LOAD SCENE')
        console.error('Scene load error:', err)
      }
    }

    void resolveSource()
    return () => {
      mounted = false
    }
  }, [sharedImage])

  useEffect(() => {
    if (!containerRef.current) return

    const updateSize = () => {
      if (!containerRef.current) return
      setViewport({
        width: Math.max(0, Math.floor(containerRef.current.clientWidth)),
        height: Math.max(0, Math.floor(containerRef.current.clientHeight)),
      })
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!source || viewport.width <= 0 || viewport.height <= 0) {
      setScene(null)
      return
    }

    const width = viewport.width
    const height = viewport.height
    const scale = Math.min(width / source.width, height / source.height)
    const imgW = Math.max(1, Math.floor(source.width * scale))
    const imgH = Math.max(1, Math.floor(source.height * scale))
    const offsetX = Math.floor((width - imgW) / 2)
    const offsetY = Math.floor((height - imgH) / 2)

    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = imgW
    tempCanvas.height = imgH
    const tempCtx = tempCanvas.getContext('2d')
    if (!tempCtx) {
      setScene(null)
      return
    }

    tempCtx.drawImage(source, 0, 0, imgW, imgH)
    const blockSize = Math.max(2, Math.floor(settings.blockSize))
    const imageData = tempCtx.getImageData(0, 0, imgW, imgH).data
    const blocks = buildLidarBlocks(imageData, imgW, imgH, blockSize)

    setScene({ blocks, imgW, imgH, offsetX, offsetY })
  }, [source, viewport.height, viewport.width, settings.blockSize])

  useEffect(() => {
    if (!source || !scene || !canvasRef.current || viewport.width <= 0 || viewport.height <= 0) return

    const canvas = canvasRef.current
    const pixelRatio = getPreviewPixelRatio(viewport.width, viewport.height)
    canvas.width = Math.max(1, Math.round(viewport.width * pixelRatio))
    canvas.height = Math.max(1, Math.round(viewport.height * pixelRatio))
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
    if (!ctx) return
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    const render = (time: number) => {
      lastFrameTimeRef.current = time
      drawLidarFrame({
        ctx,
        canvasWidth: viewport.width,
        canvasHeight: viewport.height,
        source,
        scene,
        settings,
        theme: selectedTheme,
        timeMs: time,
        mode: 'composite',
        drawOffsetX: scene.offsetX,
        drawOffsetY: scene.offsetY,
        drawImageW: scene.imgW,
        drawImageH: scene.imgH,
      })
      animationRef.current = window.requestAnimationFrame(render)
    }

    animationRef.current = window.requestAnimationFrame(render)
    return () => {
      if (animationRef.current) window.cancelAnimationFrame(animationRef.current)
    }
  }, [scene, settings, source, selectedTheme, viewport.height, viewport.width])

  const updateSetting = <K extends keyof LidarSettings>(key: K, value: string) => {
    const next = Number.parseFloat(value)
    if (!Number.isFinite(next)) return
    setSettings((prev) => ({ ...prev, [key]: next }))
  }

  const handleRefresh = () => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(LIDAR_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // Ignore storage write failures and still refresh.
    }
    window.location.reload()
  }

  const ensureFfmpeg = async () => {
    if (!ffmpegRef.current) ffmpegRef.current = new FFmpeg()
    const ffmpeg = ffmpegRef.current
    if (!ffmpeg.loaded) await ffmpeg.load()
    return ffmpeg
  }

  const buildFrames = async (
    mode: ExportMode,
    progressStart: number,
    progressEnd: number,
    options?: { maxDurationSeconds?: number }
  ): Promise<BuiltFrames | null> => {
    if (!source || !scene) return null

    const baseDuration = Math.max(0.5, EXPORT_SECONDS)
    const maxDuration = typeof options?.maxDurationSeconds === 'number'
      ? Math.max(0.5, options.maxDurationSeconds)
      : baseDuration
    const durationSeconds = Math.min(baseDuration, maxDuration)

    const progressSpan = Math.max(1, progressEnd - progressStart)
    
    // Calculate export dimensions based on original image size, respecting max side
    const maxSide = EXPORT_MAX_SIDE
    const srcW = source.naturalWidth || source.width
    const srcH = source.naturalHeight || source.height
    
    let exportW = srcW
    let exportH = srcH
    
    if (exportW > maxSide || exportH > maxSide) {
      const scale = Math.min(maxSide / exportW, maxSide / exportH)
      exportW = Math.round(exportW * scale)
      exportH = Math.round(exportH * scale)
    }
    
    // Ensure even dimensions for video encoding compatibility
    if (exportW % 2 !== 0) exportW -= 1
    if (exportH % 2 !== 0) exportH -= 1
    
    const width = exportW
    const height = exportH
    
    // Scale factor from internal scene coordinates to export coordinates
    const sceneScale = width / scene.imgW
    
    const totalFrames = Math.max(1, Math.round(EXPORT_FPS * durationSeconds))
    const delayMs = Math.round(1000 / EXPORT_FPS)
    const durationMs = durationSeconds * 1000
    const cycleMs = getWaveCycleMs(settings.speed, sceneScale, scene.imgH * sceneScale, settings.depth)
    const overlayCyclesPerClip = 3
    const motionScale = mode === 'overlay'
      ? Math.max(1, (overlayCyclesPerClip * cycleMs) / Math.max(1, durationMs))
      : 1
    const nowMs = lastFrameTimeRef.current || performance.now()
    const startTimeMs = findBestStartTimeMs(
      nowMs,
      durationSeconds,
      scene,
      settings,
      sceneScale
    )

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
    if (!ctx) throw new Error('FAILED TO CREATE EXPORT CONTEXT')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    setCapturePreviewPercent(0)
    const frames: Uint8ClampedArray[] = []

    for (let i = 0; i < totalFrames; i += 1) {
      const t = startTimeMs + (i / EXPORT_FPS) * 1000 * motionScale
      drawLidarFrame({
        ctx,
        canvasWidth: width,
        canvasHeight: height,
        source,
        scene,
        settings,
        theme: selectedTheme,
        timeMs: t,
        mode,
        drawOffsetX: 0,
        drawOffsetY: 0,
        drawImageW: width,
        drawImageH: height,
      })

      const frame = ctx.getImageData(0, 0, width, height)
      frames.push(frame.data.slice())

      if (i % 2 === 0) {
        const ratio = (i + 1) / totalFrames
        setCapturePreviewPercent(Math.min(100, Math.max(0, Math.round(ratio * 100))))
        const stage = (i / totalFrames) * 0.45
        setExportProgress(progressStart + Math.round(progressSpan * stage))
        await new Promise((resolve) => window.setTimeout(resolve, 0))
      }
    }
    setCapturePreviewPercent(100)

    return {
      frames,
      width,
      height,
      delayMs,
      durationSeconds,
      encodeProgressStart: progressStart + Math.round(progressSpan * 0.45),
      encodeProgressEnd: progressEnd,
    }
  }

  const exportGifBytes = async (type: ExportType, progressStart: number, progressEnd: number) => {
    const mode: ExportMode = type === 'overlay' ? 'overlay' : 'composite'
    const built = await buildFrames(mode, progressStart, progressEnd)
    if (!built) return null

    const { frames, width, height, delayMs, encodeProgressStart, encodeProgressEnd } = built
    const encoder = GIFEncoder()
    const sample = frames[Math.floor(frames.length * 0.6)] || frames[0]
    const palette = quantize(sample, 256)
    const encodeSpan = Math.max(1, encodeProgressEnd - encodeProgressStart)

    for (let i = 0; i < frames.length; i += 1) {
      const indexed = applyPalette(frames[i], palette)
      encoder.writeFrame(indexed, width, height, { palette, delay: delayMs })
      if (i % 4 === 0) {
        setExportProgress(encodeProgressStart + Math.round((i / frames.length) * encodeSpan))
        await new Promise((resolve) => window.setTimeout(resolve, 0))
      }
    }

    encoder.finish()
    return {
      filename: `imageglitch-lidar-${type}.gif`,
      bytes: Uint8Array.from(encoder.bytes()),
    }
  }

  const exportMp4Bytes = async (type: ExportType, progressStart: number, progressEnd: number) => {
    const mode: ExportMode = type === 'overlay' ? 'overlay' : 'composite'
    const built = await buildFrames(mode, progressStart, progressEnd)
    if (!built) return null

    const { frames, width, height, encodeProgressStart, encodeProgressEnd } = built
    const ffmpeg = await ensureFfmpeg()
    const totalFrames = frames.length
    const writeEnd = encodeProgressStart + Math.round((encodeProgressEnd - encodeProgressStart) * 0.7)
    const writeSpan = Math.max(1, writeEnd - encodeProgressStart)

    const frameNames: string[] = []
    const scratch = document.createElement('canvas')
    scratch.width = width
    scratch.height = height
    const scratchCtx = scratch.getContext('2d')
    if (!scratchCtx) throw new Error('FAILED TO CREATE MP4 SCRATCH CONTEXT')

    for (let i = 0; i < totalFrames; i += 1) {
      const imageData = new ImageData(new Uint8ClampedArray(frames[i]), width, height)
      scratchCtx.putImageData(imageData, 0, 0)
      const blob = await new Promise<Blob>((resolve, reject) => {
        scratch.toBlob((result) => {
          if (!result) {
            reject(new Error('FAILED TO ENCODE FRAME'))
            return
          }
          resolve(result)
        }, 'image/png')
      })

      const name = `lidar_${String(i).padStart(4, '0')}.png`
      await ffmpeg.writeFile(name, await fetchFile(blob))
      frameNames.push(name)

      if (i % 2 === 0) {
        setExportProgress(encodeProgressStart + Math.round((i / totalFrames) * writeSpan))
        await new Promise((resolve) => window.setTimeout(resolve, 0))
      }
    }

    setExportProgress(writeEnd)

    const outName = `imageglitch-lidar-${type}.mp4`
    await ffmpeg.exec([
      '-y',
      '-framerate',
      String(EXPORT_FPS),
      '-i',
      'lidar_%04d.png',
      '-c:v',
      'libx264',
      '-crf',
      '14',
      '-preset',
      'slow',
      '-pix_fmt',
      'yuv420p',
      outName,
    ])

    let copy = toUint8(await ffmpeg.readFile(outName) as Uint8Array | ArrayBuffer)
    if (copy.length === 0) {
      await ffmpeg.exec([
        '-y',
        '-framerate',
        String(EXPORT_FPS),
        '-i',
        'lidar_%04d.png',
        '-c:v',
        'mpeg4',
        '-q:v',
        '2',
        outName,
      ])
      copy = toUint8(await ffmpeg.readFile(outName) as Uint8Array | ArrayBuffer)
    }
    if (copy.length === 0) {
      throw new Error('EMPTY MP4 OUTPUT')
    }

    for (const name of frameNames) {
      await ffmpeg.deleteFile(name)
    }
    await ffmpeg.deleteFile(outName)

    setExportProgress(encodeProgressEnd)
    return {
      filename: outName,
      bytes: copy,
    }
  }

  const handleExport = async () => {
    if (!source || !scene || exportBusy) return

    const selectedFormats = exportFormats.filter(
      (format): format is 'gif' | 'mp4' => format === 'gif' || format === 'mp4'
    )
    if (selectedFormats.length === 0) {
      setExportNote('SELECT AT LEAST ONE FORMAT.')
      return
    }
    if (exportTypes.length === 0) {
      setExportNote('SELECT AT LEAST ONE TYPE.')
      return
    }

    setExportBusy(true)
    setExportProgress(0)
    setExportNote(null)
    setCapturePreviewPercent(null)

    try {
      const tasks: Array<{ format: 'gif' | 'mp4'; type: ExportType }> = []
      for (const format of selectedFormats) {
        for (const type of exportTypes) {
          tasks.push({ format, type })
        }
      }

      const files: Record<string, Uint8Array> = {}

      for (let i = 0; i < tasks.length; i += 1) {
        const task = tasks[i]
        const from = Math.round((i / tasks.length) * 100)
        const to = Math.round(((i + 1) / tasks.length) * 100)
        if (task.format === 'gif') {
          const result = await exportGifBytes(task.type, from, to)
          if (result) {
            files[result.filename] = result.bytes
          }
          continue
        }
        if (task.format === 'mp4') {
          const result = await exportMp4Bytes(task.type, from, to)
          if (result) {
            files[result.filename] = result.bytes
          }
          continue
        }
      }

      const entries = Object.entries(files)
      if (entries.length === 0) {
        setExportNote('NOTHING TO EXPORT.')
        return
      }

      if (entries.length === 1) {
        const [name, bytes] = entries[0]
        const delivery = await deliverFiles(
          [{ name, blob: new Blob([Uint8Array.from(bytes).buffer], { type: inferMimeType(name) }) }],
          'IMAGEGLITCH LIDAR EXPORT'
        )
        setExportProgress(100)
        if (delivery === 'canceled') {
          setExportNote('EXPORT CANCELED.')
          return
        }
        if (delivery === 'shared') {
          setExportNote('EXPORT SHARED.')
          return
        }
        setExportNote('EXPORT FILE READY.')
        return
      }

      const zipped = zipSync(files, { level: 6 })
      const delivery = await deliverFiles(
        [{ name: 'imageglitch-lidar-export.zip', blob: new Blob([zipped as unknown as BlobPart], { type: 'application/zip' }) }],
        'IMAGEGLITCH LIDAR EXPORT'
      )
      setExportProgress(100)
      if (delivery === 'canceled') {
        setExportNote('EXPORT CANCELED.')
        return
      }
      if (delivery === 'shared') {
        setExportNote('EXPORT SHARED.')
        return
      }
      setExportNote('EXPORT ZIP READY.')
    } catch (error) {
      console.error(error)
      setExportNote('EXPORT FAILED. PLEASE TRY AGAIN.')
    } finally {
      setCapturePreviewPercent(null)
      setExportBusy(false)
    }
  }

  return (
    <main className={styles.main}>
      <TopBar
        onExport={() => setIsExportOpen(true)}
        onHelp={openUploadPicker}
        helpLabel="UPLOAD"
        homeHref={`/${params.locale}`}
        showActions
      />

      <section className={styles.workspace}>
        <div className={styles.stage} ref={containerRef}>
          <canvas ref={canvasRef} className={styles.canvas} />
          <div className={styles.scanline} aria-hidden="true" />
          {scene && capturePreviewPercent !== null && (
            <>
              <div
                className={styles.captureFrame}
                style={{
                  left: `${scene.offsetX}px`,
                  top: `${scene.offsetY}px`,
                  width: `${scene.imgW}px`,
                  height: `${scene.imgH}px`,
                }}
                aria-hidden="true"
              />
              <div className={styles.captureBadge} aria-live="polite">
                FRAME PREVIEW {capturePreviewPercent}%
              </div>
            </>
          )}
          {busy && <div className={styles.loading}>PROCESSING IMAGE...</div>}
          {!source && !busy && !error && <div className={styles.loading}>LOADING SCENE...</div>}
          {error && <div className={styles.loading} style={{ color: '#ff3232' }}>{error}</div>}
        </div>

        <aside className={styles.panel}>
          <div className={`${styles.group} ${styles.parametersGroup}`}>
            <div className={styles.groupHead}>
              <div className={styles.groupTitle}>PARAMETERS</div>
              <button
                type="button"
                className={styles.refreshButton}
                onClick={handleRefresh}
                disabled={exportBusy}
                aria-label="Refresh and keep current parameters"
              >
                <svg className={styles.refreshIcon} viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M20 12a8 8 0 1 1-2.34-5.66"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                  <path
                    d="M20 4v4h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                REFRESH
              </button>
            </div>

            <div className={styles.row}>
              <label htmlFor="density">DENSITY</label>
              <span>{(settings.density * 100).toFixed(0)}%</span>
            </div>
            <input id="density" type="range" min="0.05" max="1" step="0.05" value={settings.density} onChange={(event) => updateSetting('density', event.target.value)} />

            <div className={styles.row}>
              <label htmlFor="edgeFocus">EDGE FOCUS</label>
              <span>{settings.edgeFocus.toFixed(1)}</span>
            </div>
            <input id="edgeFocus" type="range" min="0" max="10" step="0.5" value={settings.edgeFocus} onChange={(event) => updateSetting('edgeFocus', event.target.value)} />

            <div className={styles.row}>
              <label htmlFor="depth">DEPTH MAP</label>
              <span>{settings.depth.toFixed(0)}</span>
            </div>
            <input id="depth" type="range" min="0" max="2200" step="20" value={settings.depth} onChange={(event) => updateSetting('depth', event.target.value)} />

            <div className={styles.row}>
              <label htmlFor="thickness">THICKNESS</label>
              <span>{settings.thickness.toFixed(0)}</span>
            </div>
            <input id="thickness" type="range" min="40" max="260" step="5" value={settings.thickness} onChange={(event) => updateSetting('thickness', event.target.value)} />

            <div className={styles.row}>
              <label htmlFor="speed">SPEED</label>
              <span>{settings.speed.toFixed(1)}</span>
            </div>
            <input id="speed" type="range" min="0.8" max="8" step="0.2" value={settings.speed} onChange={(event) => updateSetting('speed', event.target.value)} />

            <div className={styles.row}>
              <label htmlFor="overlay">BG OVERLAY</label>
              <span>{settings.bgDarken.toFixed(2)}</span>
            </div>
            <input id="overlay" type="range" min="0" max="0.95" step="0.05" value={settings.bgDarken} onChange={(event) => updateSetting('bgDarken', event.target.value)} />

            <div className={styles.row}>
              <label htmlFor="blockSize">GRID SIZE</label>
              <span>{settings.blockSize.toFixed(0)}PX</span>
            </div>
            <input id="blockSize" type="range" min="4" max="16" step="1" value={settings.blockSize} onChange={(event) => updateSetting('blockSize', event.target.value)} />
          </div>

          <div className={styles.group}>
            <div className={styles.groupHead}>
              <div className={styles.groupTitle}>SPECTRUM</div>
              <label className={styles.pickerAction}>
                PICK
                <input
                  className={styles.pickerInput}
                  type="color"
                  value={customColor}
                  onChange={(event) => {
                    setCustomColor(event.target.value)
                    setActiveSpectrum('custom')
                  }}
                  aria-label="Custom spectrum color"
                />
              </label>
            </div>

            <div className={styles.themeGrid}>
              {Object.entries(THEMES).map(([key, value]) => (
                <button
                  key={key}
                  className={`${styles.themeButton} ${activeSpectrum === key ? styles.themeButtonActive : ''}`}
                  onClick={() => setActiveSpectrum(key as ThemeKey)}
                  aria-pressed={activeSpectrum === key}
                >
                  <span
                    className={styles.themeDot}
                    style={{
                      backgroundColor: `rgb(${value.r}, ${value.g}, ${value.b})`,
                      boxShadow: `0 0 12px rgba(${value.r}, ${value.g}, ${value.b}, 0.65)`,
                    }}
                  />
                  {value.name}
                </button>
              ))}

              <button
                className={`${styles.themeButton} ${activeSpectrum === 'custom' ? styles.themeButtonActive : ''}`}
                onClick={() => setActiveSpectrum('custom')}
                aria-pressed={activeSpectrum === 'custom'}
              >
                <span
                  className={styles.themeDot}
                  style={{
                    backgroundColor: customColor,
                    boxShadow: `0 0 12px ${customColor}`,
                  }}
                />
                CUSTOM
              </button>
            </div>
          </div>
        </aside>

        <input
          id="lidar-upload-input"
          ref={inputRef}
          type="file"
          className={styles.fileInput}
          accept={IMAGE_UPLOAD_ACCEPT}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleReplace(file)
            event.currentTarget.value = ''
          }}
        />
      </section>

      <Footer modelReady modelStatus="ready" modelProgress={1} />

      <ExportModal
        isOpen={isExportOpen}
        formats={exportFormats}
        cutoutModes={[]}
        availableFormats={['gif', 'mp4']}
        optionGroup={{
          title: 'TYPE',
          options: [
            { id: 'overlay', label: 'OVERLAY' },
            { id: 'render', label: 'RENDER' },
          ],
          selected: exportTypes,
          onToggle: (id) => {
            if (id !== 'overlay' && id !== 'render') return
            setExportTypes((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
          },
        }}
        onFormatToggle={(format) => {
          setExportFormats((prev) => (prev.includes(format) ? prev.filter((item) => item !== format) : [...prev, format]))
        }}
        onCutoutModeToggle={() => {}}
        onCancel={() => setIsExportOpen(false)}
        onDownload={handleExport}
        isBusy={exportBusy}
        note={exportNote}
        progress={exportProgress}
      />
    </main>
  )
}
