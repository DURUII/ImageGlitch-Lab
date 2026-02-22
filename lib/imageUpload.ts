import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'

const HEIC_FILE_NAME_RE = /\.(heic|heif)$/i

const HEIC_MIME_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
])

export const IMAGE_UPLOAD_ACCEPT = 'image/*,.heic,.heif,image/heic,image/heif,image/heic-sequence,image/heif-sequence'

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('FAILED TO READ IMAGE FILE'))
    reader.readAsDataURL(blob)
  })

const isHeicFile = (file: File): boolean => {
  const mime = file.type.trim().toLowerCase()
  return HEIC_MIME_TYPES.has(mime) || HEIC_FILE_NAME_RE.test(file.name)
}

const isIOSFamilyDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const legacyIOS = /iPad|iPhone|iPod/.test(ua)
  const touchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return legacyIOS || touchMac
}

const convertHeicWithFfmpeg = async (file: File): Promise<Blob> => {
  const ffmpeg = new FFmpeg()
  let inputSize = 0
  
  // Setup logging
  ffmpeg.on('log', ({ message }) => {
    console.debug('FFmpeg:', message)
  })

  try {
    // Use a custom worker script to bypass Webpack bundling issues
    // The worker script is copied to public/wasm/worker.js and runs as a native ESM worker
    const baseURL = typeof window !== 'undefined' ? window.location.origin : ''
    
    await ffmpeg.load({
      coreURL: `${baseURL}/wasm/ffmpeg-core.js`,
      wasmURL: `${baseURL}/wasm/ffmpeg-core.wasm`,
      classWorkerURL: `${baseURL}/wasm/worker.js`,
    })
    
    const inputName = 'input.heic'
    const outputName = 'output.jpg'
    
    // Write input manually to ensure full content is written
    const arrayBuffer = await file.arrayBuffer()
    const u8Input = new Uint8Array(arrayBuffer)
    inputSize = u8Input.length
    console.debug(`FFmpeg: Writing ${u8Input.length} bytes to ${inputName}`)
    await ffmpeg.writeFile(inputName, u8Input)
    
    // Convert to JPEG with quality 2 (high quality)
    // -y: overwrite output
    // Note: Some HEIC files (like Live Photos) might need specific demuxers
    // Attempting to force image2 pipe or just standard conversion
    const ret = await ffmpeg.exec(['-y', '-i', inputName, '-frames:v', '1', '-q:v', '2', '-pix_fmt', 'yuv420p', outputName])
    
    if (ret !== 0) {
      // Some versions return non-zero on success or warning?
      // Usually 0 is success.
      console.warn(`FFmpeg exec returned ${ret}`)
    }
    
    // Check if output exists
    try {
      const data = await ffmpeg.readFile(outputName)
      const buffer = data instanceof Uint8Array 
        ? data.buffer 
        : (data as unknown as ArrayBuffer)
      
      const u8 = new Uint8Array(buffer as ArrayBuffer)
      const blob = new Blob([u8], { type: 'image/jpeg' })
      return blob
    } catch (e) {
      throw new Error(`FFmpeg failed to generate output file (Input size: ${inputSize})`)
    }
  } finally {
    try {
      // Cleanup
      await ffmpeg.terminate()
    } catch {
      // Ignore termination errors
    }
  }
}

const convertHeicToJpeg = async (file: File): Promise<Blob> => {
  let conversionError: unknown

  // 1. Try heic2any first (Lightweight)
  try {
    const heic2anyModule = await import('heic2any')
    const heic2any = heic2anyModule.default || (heic2anyModule as any)
    
    if (typeof heic2any !== 'function') {
      throw new Error('HEIC2ANY_NOT_A_FUNCTION')
    }

    // Create a clean blob with explicit type to ensure heic2any recognizes it
    const buffer = await file.arrayBuffer()
    const blob = new Blob([buffer], { type: 'image/heic' })

    // Race against a timeout to prevent infinite loading
    const conversionPromise = heic2any({
      blob,
      toType: 'image/jpeg',
      quality: 0.90,
    })

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('HEIC_CONVERSION_TIMEOUT')), 15000)
    )

    const converted = await Promise.race([conversionPromise, timeoutPromise])

    if (Array.isArray(converted)) {
      if (converted.length === 0) {
        throw new Error('HEIC CONVERSION RETURNED NO FRAMES')
      }
      return converted[0]
    }

    return converted as Blob
  } catch (err) {
    console.warn('heic2any conversion failed, attempting FFmpeg fallback:', err)
    conversionError = err
  }

  // 2. Fallback to FFmpeg (Heavyweight but robust)
   try {
     return await convertHeicWithFfmpeg(file)
   } catch (ffmpegErr) {
     console.error('FFmpeg fallback failed:', ffmpegErr)
     // Throw the FFmpeg error as it is the final failure reason
     throw ffmpegErr
   }
 }

export const imageFileToDataUrl = async (file: File): Promise<string> => {
  if (!isHeicFile(file)) {
    return blobToDataUrl(file)
  }

  if (isIOSFamilyDevice()) {
    // iOS/iPadOS can decode HEIC natively; bypass third-party conversion for stability.
    return blobToDataUrl(file)
  }

  try {
    const converted = await convertHeicToJpeg(file)
    return blobToDataUrl(converted)
  } catch (error) {
    // Some HEIC variants are not supported by heic2any/libheif.
    console.warn('HEIC conversion failed.', error)
    // Throw the original error to be displayed in UI
    throw error
  }
}
