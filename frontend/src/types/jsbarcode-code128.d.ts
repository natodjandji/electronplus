/** JsBarcode's Code 128 encoder on its own (the package's main entry brings
 * every format and draws into the DOM). Untyped upstream. */
declare module "jsbarcode/bin/barcodes/CODE128" {
  export class CODE128 {
    constructor(data: string, options: object);
    /** False for text Code 128 can't hold: empty, or outside ASCII. */
    valid(): boolean;
    /** One "1" (bar) or "0" (space) per module, start and stop codes
     * included. Consumes the encoder: call it once. */
    encode(): { data: string; text: string };
  }
}
