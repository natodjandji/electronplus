/** Reads the QR (product link) and Code128 (SKU) printed on the labels. */
export interface CodeReader {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

type Format = "qr_code" | "code_128";
const FORMATS: Format[] = ["qr_code", "code_128"];

interface NativeBarcodeDetector {
  new (options: { formats: Format[] }): CodeReader;
  getSupportedFormats(): Promise<string[]>;
}

/**
 * The browser's own BarcodeDetector where it has one (Chrome on Android);
 * elsewhere (Safari on iPhone) a ZXing WebAssembly build, downloaded only
 * here and served from this site rather than a CDN. barcode-detector and
 * zxing-wasm are pinned together in package.json: the .wasm must match the
 * version the library was built against, so upgrade them as a pair.
 */
export async function createCodeReader(): Promise<CodeReader> {
  const Native = (globalThis as { BarcodeDetector?: NativeBarcodeDetector }).BarcodeDetector;
  if (Native) {
    // Only when it reads both: a label may carry just the barcode.
    const supported = await Native.getSupportedFormats().catch(() => [] as string[]);
    if (FORMATS.every((f) => supported.includes(f))) return new Native({ formats: FORMATS });
  }
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import("barcode-detector/ponyfill"),
    import("zxing-wasm/reader/zxing_reader.wasm?url"),
  ]);
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith(".wasm") ? wasmUrl : prefix + path,
    },
  });
  return new BarcodeDetector({ formats: FORMATS });
}
