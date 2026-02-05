'use client'

import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react'
import { zipSync } from 'fflate'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import { GIFEncoder, quantize, applyPalette } from 'gifenc'
import styles from '../page.module.css'
import TopBar from '@/components/TopBar'
import Footer from '@/components/Footer'
import Canvas from '@/components/editor/Canvas'
import CommitDock from '@/components/editor/CommitDock'
import AssetsTimeline from '@/components/editor/AssetsTimeline'
import OnboardingOverlay from '@/components/editor/OnboardingOverlay'
import OnboardingFocus from '@/components/editor/OnboardingFocus'
import ExportModal from '@/components/ExportModal'
import { useSAM, type Point, type MaskResult } from '@/hooks/useSAM'
import type { Subject, BGM, AppMode } from '@/types'

// --- Helpers (Previous helpers preserved) ---

const generateColor = (index: number) => {
  const colors = ['#FFFFFF', '#00FF00', '#FF00FF', '#00FFFF', '#FFFF00', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7']
  return colors[index % colors.length]
}

const createColoredMaskUrl = (maskResult: MaskResult, color: string): string => {
  const { width, height, imageData } = maskResult
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  
  const coloredData = ctx.createImageData(width, height)
  for (let i = 0; i < imageData.data.length; i += 4) {
    if (imageData.data[i + 3] > 0) {
      coloredData.data[i] = r
      coloredData.data[i + 1] = g
      coloredData.data[i + 2] = b
      coloredData.data[i + 3] = 180
    }
  }
  
  ctx.putImageData(coloredData, 0, 0)
  return canvas.toDataURL('image/png')
}

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

const getMaskBounds = (imageData: ImageData) => {
  const { width, height, data } = imageData
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      if (data[idx + 3] > 0) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < 0 || maxY < 0) return null
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  }
}

const createBrightenedMaskUrl = async (maskResult: MaskResult, imageUrl: string): Promise<string | null> => {
  const image = await loadImage(imageUrl)
  const { width, height, imageData: maskData } = maskResult

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  ctx.drawImage(image, 0, 0, width, height)
  const imgData = ctx.getImageData(0, 0, width, height)

  for (let i = 0; i < maskData.data.length; i += 4) {
    if (maskData.data[i + 3] > 0) {
      imgData.data[i] = Math.min(255, imgData.data[i] + 100)
      imgData.data[i + 1] = Math.min(255, imgData.data[i + 1] + 100)
      imgData.data[i + 2] = Math.min(255, imgData.data[i + 2] + 100)
    } else {
      imgData.data[i + 3] = 0
    }
  }

  ctx.putImageData(imgData, 0, 0)
  return canvas.toDataURL('image/png')
}

const createCroppedPreviewUrl = async (maskResult: MaskResult, imageUrl: string): Promise<string | null> => {
  const bounds = getMaskBounds(maskResult.imageData)
  if (!bounds) return null

  const image = await loadImage(imageUrl)
  const { width, height } = maskResult

  const imageCanvas = document.createElement('canvas')
  imageCanvas.width = width
  imageCanvas.height = height
  const imageCtx = imageCanvas.getContext('2d')!
  imageCtx.drawImage(image, 0, 0, width, height)

  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = width
  maskCanvas.height = height
  const maskCtx = maskCanvas.getContext('2d')!
  maskCtx.putImageData(maskResult.imageData, 0, 0)

  imageCtx.globalCompositeOperation = 'destination-in'
  imageCtx.drawImage(maskCanvas, 0, 0)

  const cropCanvas = document.createElement('canvas')
  cropCanvas.width = bounds.width
  cropCanvas.height = bounds.height
  const cropCtx = cropCanvas.getContext('2d')!
  cropCtx.drawImage(
    imageCanvas,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height
  )

  return cropCanvas.toDataURL('image/png')
}

// --- Main Component ---

export default function Home() {
  // Title flash
  useEffect(() => {
    const baseTitle = 'FLASHPHOTO'
    let on = false
    const interval = window.setInterval(() => {
      on = !on
      document.title = on ? `⚡ ${baseTitle}` : baseTitle
    }, 1200)
    document.title = baseTitle
    return () => {
      window.clearInterval(interval)
      document.title = baseTitle
    }
  }, [])
  // State
  type HistorySnapshot = {
    mode: AppMode
    stagingPoints: Point[]
    stagingMask: MaskResult | null
    stagingColoredMaskUrl: string | null
    subjects: Subject[]
    focusPreviewId: number | null
  }
  const [mode, setMode] = useState<AppMode>('editing') // Default to editing
  const [uploadedImage, setUploadedImage] = useState<string | null>(null)
  const [imageAspect, setImageAspect] = useState<number | null>(null)
  const [canvasWidth, setCanvasWidth] = useState<number | null>(null)
  const [imageWidthPx, setImageWidthPx] = useState<number | null>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const [previewStyle, setPreviewStyle] = useState<'highlight' | 'solid'>('highlight')
  const [bgm, setBgm] = useState<'none' | 'all-my-fellas.mp3' | 'whats-wrong-with-u.mp3'>('all-my-fellas.mp3')
  const [isLooping, setIsLooping] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentPlayingIndex, setCurrentPlayingIndex] = useState<number | null>(null)
  const [previewMaskSrc, setPreviewMaskSrc] = useState<string | null>(null)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [exportFormats, setExportFormats] = useState<Array<'mp4' | 'gif' | 'live' | 'cutout'>>(['mp4'])
  const [cutoutModes, setCutoutModes] = useState<Array<'cropped' | 'fullsize'>>(['cropped'])
  const [exportBusy, setExportBusy] = useState(false)
  const [exportNote, setExportNote] = useState<string | null>(null)
  const [exportProgress, setExportProgress] = useState<number>(0)
  const ffmpegRef = useRef<FFmpeg | null>(null)
  const prevModeRef = useRef<AppMode>('editing')
  const previewTokenRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const subjectsRef = useRef<Subject[]>([])
  const loopRef = useRef(false)
  const styleRef = useRef<'highlight' | 'solid'>('highlight')
  const togglePreviewRef = useRef<() => void>(() => {})
  const undoStackRef = useRef<HistorySnapshot[]>([])
  const redoStackRef = useRef<HistorySnapshot[]>([])
  const isRestoringRef = useRef(false)
  const deleteTimeoutRef = useRef<number | null>(null)
  
  // Layout Transitions
  const [isLayoutReady, setIsLayoutReady] = useState(false)
  
  // Fake Encoding Progress (0-1)
  const [encodingProgress, setEncodingProgress] = useState<number | null>(null)

  // Onboarding
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [onboardingStep, setOnboardingStep] = useState(0)
  const onboardingTotal = 7
  const [focusGuideOpen, setFocusGuideOpen] = useState(false)
  const [focusGuideStep, setFocusGuideStep] = useState(0)
  
  // Staging Subject (Current one being edited)
  const [stagingPoints, setStagingPoints] = useState<Point[]>([])
  const [stagingMask, setStagingMask] = useState<MaskResult | null>(null)
  const [stagingColoredMaskUrl, setStagingColoredMaskUrl] = useState<string | null>(null)
  
  // Confirmed Subjects
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [lastAddedId, setLastAddedId] = useState<number | null>(null)
  const [deleteEffectId, setDeleteEffectId] = useState<number | null>(null)
  const [focusPreviewId, setFocusPreviewId] = useState<number | null>(null)

  
  // SAM
  const { 
    status: samStatus, 
    loadingProgress, 
    isEncoded, 
    encodeImage, 
    decode,
    initModel
  } = useSAM(true)

  // Computed
  const isModelReady = samStatus === 'model_ready' || samStatus === 'encoded'
  const stagingColor = generateColor(subjects.length)
  const canPlay = subjects.length > 0 && encodingProgress === null
  const isTimelineLocked = mode === 'previewing' || encodingProgress !== null || stagingPoints.length > 0 || !!stagingMask

  useEffect(() => {
    subjectsRef.current = subjects
  }, [subjects])

  useEffect(() => {
    loopRef.current = isLooping
  }, [isLooping])

  useEffect(() => {
    styleRef.current = previewStyle
  }, [previewStyle])

  useEffect(() => {
    initModel()
  }, [initModel])

  // --- Effects ---

  // Auto-encode image when uploaded
  useEffect(() => {
    // Only encode if model is ready and we have an image
    // Note: initModel() is called manually in startUploadTransition
    if (uploadedImage && samStatus === 'model_ready' && !isEncoded) {
      encodeImage(uploadedImage)
    }
  }, [uploadedImage, samStatus, isEncoded, encodeImage])
  
  // Fake Encoding Progress Logic
  useEffect(() => {
    if (samStatus === 'loading_model') {
       // Phase 1 & 2: Loading model (0 -> 28%)
       // Use real loadingProgress if available, otherwise fake it
       if (loadingProgress?.progress) {
          // Map real progress (0-1) to UI progress (0-0.28)
          setEncodingProgress(loadingProgress.progress * 0.28)
       } else {
          setEncodingProgress(0.1) // Fallback
       }
    } else if (samStatus === 'encoding') {
       // Phase 3-5: Encoding (28% -> 100%)
       // Start fake progress from 0.28
       setEncodingProgress(prev => Math.max(prev || 0.28, 0.28))
       
       const interval = setInterval(() => {
         setEncodingProgress(prev => {
           const current = prev || 0.28
           if (current >= 0.99) return 0.99
           // Slow down as it gets closer to 100
           const step = current > 0.8 ? 0.002 : 0.008
           return current + step
         })
       }, 50)
       return () => clearInterval(interval)
    } else if (samStatus === 'encoded' || samStatus === 'model_ready') {
       // Done
       setEncodingProgress(null)
    }
  }, [samStatus, loadingProgress])

  // Mock initial load (optional, for dev)
  useEffect(() => {
    // If we want to load a sample image by default
    // const sample = '/examples/input-sample.jpg'
    // loadImage(sample).then(() => setUploadedImage(sample))
  }, [])

  // useEffect moved down to avoid ReferenceError


  useEffect(() => {
    if (!imageAspect) {
      setCanvasWidth(null)
      setImageWidthPx(null)
      return
    }
    const el = workspaceRef.current
    if (!el) return

    const update = () => {
      const height = el.clientHeight
      const width = el.clientWidth
      const computedImageWidth = Math.round(height * imageAspect)
      const maxLeftWidth = Math.round(width * 0.45)
      const nextCanvasWidth = Math.min(computedImageWidth, maxLeftWidth)
      setImageWidthPx(computedImageWidth)
      setCanvasWidth(nextCanvasWidth)
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      ro.disconnect()
    }
  }, [imageAspect])

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  const createSnapshot = useCallback((): HistorySnapshot => {
    return {
      mode,
      stagingPoints,
      stagingMask,
      stagingColoredMaskUrl,
      subjects,
      focusPreviewId
    }
  }, [mode, stagingPoints, stagingMask, stagingColoredMaskUrl, subjects, focusPreviewId])

  const pushHistory = useCallback(() => {
    if (isRestoringRef.current) return
    const snapshot = createSnapshot()
    undoStackRef.current.push(snapshot)
    if (undoStackRef.current.length > 200) {
      undoStackRef.current.shift()
    }
    redoStackRef.current = []
  }, [createSnapshot])

  const applySnapshot = useCallback((snapshot: HistorySnapshot) => {
    isRestoringRef.current = true
    if (deleteTimeoutRef.current) {
      window.clearTimeout(deleteTimeoutRef.current)
      deleteTimeoutRef.current = null
    }
    setDeleteEffectId(null)
    setLastAddedId(null)
    setMode(snapshot.mode)
    setStagingPoints(snapshot.stagingPoints)
    setStagingMask(snapshot.stagingMask)
    setStagingColoredMaskUrl(snapshot.stagingColoredMaskUrl)
    setSubjects(snapshot.subjects)
    const focusOk = snapshot.focusPreviewId != null && snapshot.subjects.some(s => s.id === snapshot.focusPreviewId)
    setFocusPreviewId(focusOk ? snapshot.focusPreviewId : null)
    isRestoringRef.current = false
  }, [])

  const handleUndo = useCallback(() => {
    if (mode === 'previewing' || encodingProgress !== null) return
    const stack = undoStackRef.current
    if (stack.length === 0) return
    const current = createSnapshot()
    const prev = stack.pop()!
    redoStackRef.current.push(current)
    applySnapshot(prev)
  }, [mode, encodingProgress, createSnapshot, applySnapshot])

  const handleRedo = useCallback(() => {
    if (mode === 'previewing' || encodingProgress !== null) return
    const stack = redoStackRef.current
    if (stack.length === 0) return
    const current = createSnapshot()
    const next = stack.pop()!
    undoStackRef.current.push(current)
    applySnapshot(next)
  }, [mode, encodingProgress, createSnapshot, applySnapshot])

  const dataUrlToUint8 = (dataUrl: string) => {
    const base64 = dataUrl.split(',')[1] || ''
    const binary = atob(base64)
    const len = binary.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const createFullsizeCutoutUrl = async (maskResult: MaskResult, imageUrl: string): Promise<string | null> => {
    const image = await loadImage(imageUrl)
    const { width, height, imageData: maskData } = maskResult
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!

    ctx.drawImage(image, 0, 0, width, height)
    const imgData = ctx.getImageData(0, 0, width, height)

    for (let i = 0; i < maskData.data.length; i += 4) {
      if (maskData.data[i + 3] === 0) {
        imgData.data[i + 3] = 0
      }
    }

    ctx.putImageData(imgData, 0, 0)
    return canvas.toDataURL('image/png')
  }

  const stopPreview = (restoreMode: boolean = true) => {
    previewTokenRef.current += 1
    setIsPlaying(false)
    setCurrentPlayingIndex(null)
    setPreviewMaskSrc(null)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    if (restoreMode) {
      setMode(prevModeRef.current)
    }
  }

  const getMaskFor = (subject: Subject): string | null => {
    if (styleRef.current === 'highlight') {
      return subject.brightenedMaskUrl || subject.coloredMaskUrl || null
    }
    return subject.coloredMaskUrl || null
  }

  const runPreview = async (token: number) => {
    while (token === previewTokenRef.current) {
      const list = subjectsRef.current
      if (list.length === 0) break
      for (let i = 0; i < list.length; i++) {
        if (token !== previewTokenRef.current) return
        const subject = list[i]
        setCurrentPlayingIndex(i)
        setPreviewMaskSrc(getMaskFor(subject))
        const duration = Math.max(0.05, subject.duration ?? 0.1)
        await sleep(duration * 1000)
      }
      if (!loopRef.current) break
    }
    if (token === previewTokenRef.current) {
      stopPreview(true)
    }
  }

  const startPreview = () => {
    if (!canPlay) return
    prevModeRef.current = mode
    setFocusPreviewId(null)
    setMode('previewing')
    setIsPlaying(true)
    const token = (previewTokenRef.current += 1)

    if (bgm !== 'none') {
      if (!audioRef.current) {
        audioRef.current = new Audio()
      }
      const audio = audioRef.current
      audio.src = `/bgm/${bgm}`
      audio.loop = isLooping
      audio.currentTime = 0
      audio.play().catch(() => {
        // Ignore autoplay restrictions
      })
    }

    runPreview(token)
  }

  const togglePreview = () => {
    if (isPlaying) {
      stopPreview(true)
      return
    }
    startPreview()
  }

  const toggleSubjectPreview = (id: number) => {
    setFocusPreviewId(prev => (prev === id ? null : id))
  }

  const focusPreviewSrc = (() => {
    if (!focusPreviewId) return null
    const subject = subjects.find(s => s.id === focusPreviewId)
    return subject ? getMaskFor(subject) : null
  })()

  useEffect(() => {
    togglePreviewRef.current = togglePreview
  }, [togglePreview])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.loop = isLooping
    }
  }, [isLooping])

  useEffect(() => {
    return () => {
      stopPreview(false)
    }
  }, [])

  const buildExportFrames = async () => {
    if (!uploadedImage) return null
    const validSubjects = subjects.filter(s => s.maskResult && (s.coloredMaskUrl || s.brightenedMaskUrl))
    if (validSubjects.length === 0) return null
    const baseImage = await loadImage(uploadedImage)
    const width = validSubjects[0].maskResult!.width
    const height = validSubjects[0].maskResult!.height

    const overlays = await Promise.all(
      validSubjects.map(async (s) => {
        const url = previewStyle === 'highlight'
          ? (s.brightenedMaskUrl || s.coloredMaskUrl)
          : s.coloredMaskUrl
        if (!url) return null
        const img = await loadImage(url)
        return { id: s.id, img }
      })
    )

    return { validSubjects, baseImage, width, height, overlays }
  }

  const renderFrames = async () => {
    const data = await buildExportFrames()
    if (!data) {
      setExportNote('NO SUBJECTS TO EXPORT.')
      return null
    }
    const { validSubjects, baseImage, width, height, overlays } = data
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!

    const fps = 30
    const frames: { data: Uint8ClampedArray; duration: number }[] = []
    const durations = validSubjects.map(s => Math.max(0.05, s.duration ?? 0.1))
    const repeats = durations.map(d => Math.max(1, Math.round(d * fps)))

    const draw = (index: number) => {
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(baseImage, 0, 0, width, height)
      const overlay = overlays[index]
      if (overlay?.img) {
        ctx.drawImage(overlay.img, 0, 0, width, height)
      }
    }

    for (let i = 0; i < validSubjects.length; i++) {
      draw(i)
      const imageData = ctx.getImageData(0, 0, width, height)
      for (let r = 0; r < repeats[i]; r++) {
        frames.push({ data: imageData.data.slice(), duration: 1000 / fps })
      }
      setExportProgress(Math.round(((i + 1) / validSubjects.length) * 40))
    }

    return { frames, width, height, fps }
  }

  const ensureFfmpeg = async () => {
    if (!ffmpegRef.current) {
      const ffmpeg = new FFmpeg()
      ffmpeg.on('progress', ({ progress }) => {
        const pct = Math.round(40 + progress * 50)
        setExportProgress(pct)
      })
      ffmpegRef.current = ffmpeg
    }
    const ffmpeg = ffmpegRef.current
    if (!ffmpeg.loaded) {
      await ffmpeg.load()
    }
    return ffmpeg
  }

  const exportMp4WithFfmpeg = async () => {
    const rendered = await renderFrames()
    if (!rendered) return
    const { frames, width, height, fps } = rendered
    const ffmpeg = await ensureFfmpeg()
    const frameCount = frames.length
    const written: string[] = []

    for (let i = 0; i < frameCount; i++) {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      const frameData = new Uint8ClampedArray(frames[i].data)
      const imageData = new ImageData(frameData, width, height)
      ctx.putImageData(imageData, 0, 0)
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob(b => resolve(b!), 'image/png'))
      const name = `frame_${String(i).padStart(4, '0')}.png`
      await ffmpeg.writeFile(name, await fetchFile(blob))
      written.push(name)
      if (i % 10 === 0) {
        setExportProgress(40 + Math.round((i / frameCount) * 30))
      }
    }

    await ffmpeg.exec([
      '-framerate', String(fps),
      '-i', 'frame_%04d.png',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      'out.mp4'
    ])

    const data = await ffmpeg.readFile('out.mp4')
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data as unknown as ArrayBuffer)
    const copy = Uint8Array.from(bytes)
    downloadBlob(new Blob([copy], { type: 'video/mp4' }), 'imageglitch-export.mp4')

    for (const name of written) {
      await ffmpeg.deleteFile(name)
    }
    await ffmpeg.deleteFile('out.mp4')
  }

  const exportGif = async () => {
    const rendered = await renderFrames()
    if (!rendered) return
    const { frames, width, height } = rendered
    const encoder = GIFEncoder()
    const sample = frames[Math.max(0, frames.length - 1)]?.data
    const palette = quantize(sample, 256)

    const total = frames.length
    frames.forEach((frame, idx) => {
      const indexed = applyPalette(frame.data, palette)
      encoder.writeFrame(indexed, width, height, { palette, delay: frame.duration })
      if (idx % 10 === 0) {
        setExportProgress(40 + Math.round((idx / total) * 50))
      }
    })

    encoder.finish()
    const gifData = encoder.bytes()
    downloadBlob(new Blob([gifData], { type: 'image/gif' }), 'imageglitch-export.gif')
  }

  const exportLivePhoto = async () => {
    setExportNote('LIVE PHOTO EXPORT IS LIMITED IN BROWSER. EXPORTING MP4 AND STILL.')
    await exportMp4WithFfmpeg()
    const data = await buildExportFrames()
    if (!data) return
    const { baseImage, width, height } = data
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(baseImage, 0, 0, width, height)
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.92))
    downloadBlob(blob, 'imageglitch-live-photo.jpg')
  }

  const exportCutoutZip = async () => {
    if (!uploadedImage) return
    const files: Record<string, Uint8Array> = {}
    const modes = cutoutModes.length > 0 ? cutoutModes : ['cropped']

    const jobs = subjects.map(async (subject, index) => {
      if (!subject.maskResult) return
      const id = String(index + 1).padStart(2, '0')
      const baseName = `${subject.name || `SUB_${id}`}.png`
      if (modes.includes('cropped')) {
        const url = subject.previewUrl || await createCroppedPreviewUrl(subject.maskResult, uploadedImage)
        if (url) {
          files[`1.cropped/${baseName}`] = dataUrlToUint8(url)
        }
      }
      if (modes.includes('fullsize')) {
        const url = await createFullsizeCutoutUrl(subject.maskResult, uploadedImage)
        if (url) {
          files[`2.fullsize/${baseName}`] = dataUrlToUint8(url)
        }
      }
    })

    await Promise.all(jobs)
    const zipped = zipSync(files, { level: 6 })
    const zipBlob = new Blob([zipped as unknown as BlobPart], { type: 'application/zip' })
    downloadBlob(zipBlob, 'imageglitch-cutouts.zip')
  }

  const handleExport = async () => {
    if (exportBusy) return
    setExportNote(null)
    setExportProgress(0)
    setExportBusy(true)
    try {
      if (exportFormats.length === 0) {
        setExportNote('SELECT AT LEAST ONE FORMAT.')
        return
      }
      for (const format of exportFormats) {
        if (format === 'cutout') {
          await exportCutoutZip()
        } else if (format === 'gif') {
          await exportGif()
        } else if (format === 'mp4') {
          await exportMp4WithFfmpeg()
        } else if (format === 'live') {
          await exportLivePhoto()
        }
      }
    } catch (err) {
      console.error(err)
      setExportNote('EXPORT FAILED. PLEASE TRY AGAIN.')
    } finally {
      setExportBusy(false)
      setExportProgress(0)
    }
  }

  // --- Handlers ---

  const startUploadTransition = (dataUrl: string) => {
    setUploadedImage(dataUrl)
    // 1. Reset state
    setSubjects([])
    setStagingPoints([])
    setStagingMask(null)
    setStagingColoredMaskUrl(null)
    setMode('editing')
    undoStackRef.current = []
    redoStackRef.current = []
    if (deleteTimeoutRef.current) {
      window.clearTimeout(deleteTimeoutRef.current)
      deleteTimeoutRef.current = null
    }
    const hasGuided = typeof window !== 'undefined' && window.localStorage.getItem('imageglitch_onboarded') === '1'
    if (!hasGuided) {
      setFocusGuideOpen(true)
      setFocusGuideStep(0)
    }
    setLastAddedId(null)
    
    // 2. Trigger layout transition after short delay
    setTimeout(() => {
      setIsLayoutReady(true)
      // 3. Start model init only after layout is ready (smooth transition)
      initModel()
    }, 600) // Wait for 0.5s transition + buffer
  }

  const handleUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string
      try {
        const img = await loadImage(dataUrl)
        const aspect = img.width / img.height
        setImageAspect(aspect)
      } catch {
        setImageAspect(null)
      }
      startUploadTransition(dataUrl)
    }
    reader.readAsDataURL(file)
  }
  
  const handleUseSample = async () => {
    const sample = '/examples/input-sample.jpg'
    try {
      const img = await loadImage(sample) // Preload
      const aspect = img.width / img.height
      setImageAspect(aspect)
    } catch {
      setImageAspect(null)
    }
    startUploadTransition(sample)
  }

  const handlePointAdd = async (x: number, y: number, label: 0 | 1) => {
    if (mode !== 'editing' || !uploadedImage || !isEncoded) return
    pushHistory()

    const newPoints = [...stagingPoints, { x, y, label }]
    setStagingPoints(newPoints)

    try {
      const maskResult = await decode(newPoints)
      setStagingMask(maskResult)
      const coloredUrl = createColoredMaskUrl(maskResult, stagingColor)
      setStagingColoredMaskUrl(coloredUrl)
    } catch (err) {
      console.error('Decode error:', err)
    }
  }

  const handleCommit = useCallback(async () => {
    if (!stagingMask || !uploadedImage) return
    pushHistory()

    try {
      const [previewUrl, brightenedMaskUrl] = await Promise.all([
        createCroppedPreviewUrl(stagingMask, uploadedImage),
        createBrightenedMaskUrl(stagingMask, uploadedImage)
      ])

      const newSubject: Subject = {
        id: Date.now(),
        name: `SUB_${String(subjects.length + 1).padStart(2, '0')}`,
        color: stagingColor,
        points: stagingPoints,
        maskResult: stagingMask,
        coloredMaskUrl: stagingColoredMaskUrl!,
        previewUrl: previewUrl ?? undefined,
        brightenedMaskUrl: brightenedMaskUrl ?? undefined,
        duration: 0.1 // Default duration
      }

      setSubjects([...subjects, newSubject])
      setLastAddedId(newSubject.id)
      window.setTimeout(() => setLastAddedId(null), 500)
      
      // Reset staging
      setStagingPoints([])
      setStagingMask(null)
      setStagingColoredMaskUrl(null)
      
    } catch (err) {
      console.error('Commit error:', err)
    }
  }, [stagingMask, uploadedImage, subjects, stagingColor, stagingPoints, stagingColoredMaskUrl, pushHistory])

  const handleResetStaging = useCallback(() => {
    if (stagingPoints.length === 0 && !stagingMask) return
    pushHistory()
    setStagingPoints([])
    setStagingMask(null)
    setStagingColoredMaskUrl(null)
  }, [stagingPoints.length, stagingMask, pushHistory])

  const handleReorder = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    pushHistory()
    setSubjects(prev => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  const handleDeleteSubject = (id: number) => {
    pushHistory()
    if (deleteTimeoutRef.current) {
      window.clearTimeout(deleteTimeoutRef.current)
      deleteTimeoutRef.current = null
    }
    setDeleteEffectId(id)
    deleteTimeoutRef.current = window.setTimeout(() => {
      setSubjects(prev => prev.filter(s => s.id !== id))
      if (focusPreviewId === id) setFocusPreviewId(null)
      setDeleteEffectId(null)
      deleteTimeoutRef.current = null
    }, 140)
  }

  const handleNameChange = useCallback((id: number, name: string) => {
    pushHistory()
    setSubjects(prev => prev.map(s => (s.id === id ? { ...s, name } : s)))
  }, [pushHistory])

  const handleColorChange = useCallback((id: number, color: string) => {
    pushHistory()
    setSubjects(prev => prev.map(s => (s.id === id ? { ...s, color } : s)))
  }, [pushHistory])

  const handleDurationChange = useCallback((id: number, delta: number) => {
    pushHistory()
    setSubjects(prev => prev.map(s => {
      if (s.id === id) {
        const newDur = Math.max(0.05, (s.duration || 0.1) + delta)
        return { ...s, duration: parseFloat(newDur.toFixed(2)) }
      }
      return s
    }))
  }, [pushHistory])

  const handleDuplicate = useCallback((id: number) => {
    const sub = subjects.find(s => s.id === id)
    if (!sub) return
    pushHistory()
    const newId = Date.now()
    setSubjects(prev => [...prev, { ...sub, id: newId }])
    setLastAddedId(newId)
    window.setTimeout(() => setLastAddedId(null), 500)
  }, [subjects, pushHistory])

  const handleOnboardingNext = () => {
    setOnboardingStep(prev => {
      const next = prev + 1
      if (next >= onboardingTotal) {
        setOnboardingOpen(false)
        return prev
      }
      return next
    })
  }

  const handleOnboardingSkip = () => {
    setOnboardingOpen(false)
  }

  const handleFocusGuideNext = () => {
    setFocusGuideStep(prev => {
      const next = prev + 1
      if (next >= 2) {
        setFocusGuideOpen(false)
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('imageglitch_onboarded', '1')
        }
        return prev
      }
      return next
    })
  }

  const handleFocusGuideSkip = () => {
    setFocusGuideOpen(false)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('imageglitch_onboarded', '1')
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
        return
      }

      if (e.code === 'Space') {
        e.preventDefault()
        const active = document.activeElement as HTMLElement | null
        if (active && active.tagName === 'BUTTON') {
          active.blur()
        }
        togglePreviewRef.current()
        return
      }

      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        handleUndo()
        return
      }

      if ((e.metaKey || e.ctrlKey) && ((e.shiftKey && e.key.toLowerCase() === 'z') || e.key.toLowerCase() === 'y')) {
        e.preventDefault()
        handleRedo()
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        setIsExportOpen(true)
        return
      }

      if (e.code === 'Enter') {
        if (mode === 'editing' && stagingMask && encodingProgress === null) {
          e.preventDefault()
          handleCommit()
        }
        return
      }

      if (e.code === 'Escape') {
        if (mode === 'editing' && stagingPoints.length > 0) {
          e.preventDefault()
          handleResetStaging()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mode, stagingMask, stagingPoints.length, encodingProgress, handleCommit, handleResetStaging, handleUndo, handleRedo])


  // Determine Status and Color
  let statusText = ''
  let statusColor = '#FFFFFF'
  
  if (encodingProgress !== null) {
    statusText = 'ENCODING'
    statusColor = '#FFFF00'
  } else if (mode === 'previewing') {
    statusText = 'PREVIEWING'
    statusColor = '#00FFFF'
  } else {
    statusText = 'EDITING'
    statusColor = '#FFFFFF'
  }

  // --- Render ---

  const layoutStyle = canvasWidth
    ? ({ ['--canvas-width' as any]: `${canvasWidth}px` } as CSSProperties)
    : undefined

  return (
    <main className={styles.main} style={layoutStyle}>
      <TopBar 
        onExport={() => setIsExportOpen(true)}
        onHelp={() => {
          setOnboardingStep(0)
          setOnboardingOpen(true)
        }}
        showActions={isLayoutReady}
        status={isLayoutReady ? statusText : undefined}
        statusColor={statusColor}
      />
      
      <div 
        ref={workspaceRef}
        className={`${styles.workspace} ${isLayoutReady ? styles.layoutReady : ''}`}
        style={layoutStyle}
      >
        {/* Left: Canvas */}
        <div className={styles.canvasArea}>
          <Canvas 
            imageSrc={uploadedImage}
            maskImageSrc={stagingColoredMaskUrl}
            previewMaskSrc={previewMaskSrc}
            focusMaskSrc={focusPreviewSrc}
            points={stagingPoints}
            color={stagingColor}
            mode={mode}
            encodingProgress={encodingProgress ?? undefined}
            imageWidthPx={imageWidthPx ?? undefined}
            onPointAdd={handlePointAdd}
            onUpload={handleUpload}
            onUseSample={handleUseSample}
          />
        </div>

        {/* Center: Commit Dock */}
        <div className={styles.dockArea}>
          <CommitDock 
            onAdd={handleCommit}
            onReset={handleResetStaging}
            canAdd={!!stagingMask}
            canReset={stagingPoints.length > 0}
            mode={mode}
            previewStyle={previewStyle}
            onPreviewStyleChange={setPreviewStyle}
            bgm={bgm}
            onBgmChange={setBgm}
            isPlaying={isPlaying}
            isLooping={isLooping}
            canPlay={canPlay}
            onPlayToggle={togglePreview}
            onLoopToggle={() => setIsLooping(prev => !prev)}
          />
        </div>

        {/* Right: Timeline */}
        <div className={styles.timelineArea}>
          <AssetsTimeline 
            subjects={subjects}
            isLocked={isTimelineLocked}
            onReorder={handleReorder}
            onNameChange={handleNameChange}
            onColorChange={handleColorChange}
            onPreviewSubject={toggleSubjectPreview}
            onFocusPreview={(id) => setFocusPreviewId(id)}
            onDelete={handleDeleteSubject}
            onDuplicate={handleDuplicate}
            onDurationChange={handleDurationChange}
            currentPlayingIndex={currentPlayingIndex}
            newlyAddedId={lastAddedId}
            deleteEffectId={deleteEffectId}
          />
        </div>
      </div>

      <Footer 
        modelProgress={typeof loadingProgress?.progress === 'number' ? loadingProgress.progress : 0} 
        modelReady={isModelReady} 
        modelStatus={samStatus}
      />

      <OnboardingOverlay
        isOpen={onboardingOpen && isLayoutReady}
        step={onboardingStep}
        onNext={handleOnboardingNext}
        onSkip={handleOnboardingSkip}
      />

      <OnboardingFocus
        isOpen={focusGuideOpen && isLayoutReady}
        step={focusGuideStep}
        onNext={handleFocusGuideNext}
        onSkip={handleFocusGuideSkip}
      />

      <ExportModal
        isOpen={isExportOpen}
        formats={exportFormats}
        cutoutModes={cutoutModes}
        onFormatToggle={(format) =>
          setExportFormats(prev =>
            prev.includes(format) ? prev.filter(f => f !== format) : [...prev, format]
          )
        }
        onCutoutModeToggle={(mode) =>
          setCutoutModes(prev =>
            prev.includes(mode) ? prev.filter(m => m !== mode) : [...prev, mode]
          )
        }
        onCancel={() => setIsExportOpen(false)}
        onDownload={handleExport}
        isBusy={exportBusy}
        note={exportNote}
        progress={exportProgress}
      />
    </main>
  )
}
