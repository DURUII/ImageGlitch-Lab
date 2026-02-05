import { env, SamModel, AutoProcessor, RawImage, Tensor } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.14.0';

// Load models and wasm from same-origin files (public/models/, public/wasm/)
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = `${self.location.origin}/models/`;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = `${self.location.origin}/wasm/`;

// Singleton pattern for lazy-loading model and processor
class SegmentAnythingSingleton {
  static model_id = 'Xenova/slimsam-77-uniform';
  static model = null;
  static processor = null;
  static quantized = true;

  static async getInstance() {
    if (!this.model) {
      this.model = SamModel.from_pretrained(this.model_id, {
        quantized: this.quantized,
        progress_callback: (progress) => {
          self.postMessage({
            type: 'loading_progress',
            data: progress,
          });
        },
      });
    }
    if (!this.processor) {
      this.processor = AutoProcessor.from_pretrained(this.model_id);
    }
    return Promise.all([this.model, this.processor]);
  }
}

// State variables
let image_embeddings = null;
let image_inputs = null;
let ready = false;

self.onmessage = async (e) => {
  const { type, data } = e.data;

  // Initialize model on first message
  if (!ready) {
    try {
      self.postMessage({ type: 'status', data: 'loading_model' });
      await SegmentAnythingSingleton.getInstance();
      ready = true;
      self.postMessage({ type: 'ready' });
    } catch (error) {
      self.postMessage({ type: 'error', data: error.message });
      return;
    }
  }

  const [model, processor] = await SegmentAnythingSingleton.getInstance();

  if (type === 'reset') {
    image_inputs = null;
    image_embeddings = null;
    self.postMessage({ type: 'reset_done' });

  } else if (type === 'encode') {
    // Encode image to get embeddings
    self.postMessage({ type: 'status', data: 'encoding' });

    try {
      const image = await RawImage.read(data);
      image_inputs = await processor(image);
      image_embeddings = await model.get_image_embeddings(image_inputs);

      self.postMessage({
        type: 'encode_done',
        data: {
          width: image_inputs.original_sizes[0][1],
          height: image_inputs.original_sizes[0][0],
        },
      });
    } catch (error) {
      self.postMessage({ type: 'error', data: error.message });
    }

  } else if (type === 'decode') {
    // Decode points to get mask
    if (!image_embeddings || !image_inputs) {
      self.postMessage({ type: 'error', data: 'No image encoded' });
      return;
    }

    self.postMessage({ type: 'status', data: 'decoding' });

    try {
      const reshaped = image_inputs.reshaped_input_sizes[0];
      const points = data.points.map(p => [p.x * reshaped[1] / 100, p.y * reshaped[0] / 100]);
      const labels = data.points.map(p => BigInt(p.label ?? 1));

      const input_points = new Tensor(
        'float32',
        points.flat(Infinity),
        [1, 1, points.length, 2],
      );
      const input_labels = new Tensor(
        'int64',
        labels.flat(Infinity),
        [1, 1, labels.length],
      );

      // Generate mask
      const outputs = await model({
        ...image_embeddings,
        input_points,
        input_labels,
      });

      // Post-process mask
      const masks = await processor.post_process_masks(
        outputs.pred_masks,
        image_inputs.original_sizes,
        image_inputs.reshaped_input_sizes,
      );

      const mask = RawImage.fromTensor(masks[0][0]);
      const scores = outputs.iou_scores.data;

      // Find best mask
      let bestIndex = 0;
      for (let i = 1; i < scores.length; i++) {
        if (scores[i] > scores[bestIndex]) {
          bestIndex = i;
        }
      }

      // Convert mask to RGBA image data (binary alpha mask)
      const width = mask.width;
      const height = mask.height;
      const maskData = new Uint8ClampedArray(width * height * 4);
      const numMasks = scores.length; // 3

      for (let i = 0; i < width * height; i++) {
        const val = mask.data[numMasks * i + bestIndex];
        const offset = i * 4;
        if (val === 1) {
          maskData[offset] = 255;
          maskData[offset + 1] = 255;
          maskData[offset + 2] = 255;
          maskData[offset + 3] = 255;
        } else {
          maskData[offset] = 0;
          maskData[offset + 1] = 0;
          maskData[offset + 2] = 0;
          maskData[offset + 3] = 0;
        }
      }

      self.postMessage({
        type: 'decode_done',
        data: {
          mask: maskData,
          width,
          height,
          score: scores[bestIndex],
        },
      });
    } catch (error) {
      self.postMessage({ type: 'error', data: error.message });
    }
  }
};
