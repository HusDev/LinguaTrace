/**
 * Making a capture small enough to travel.
 *
 * A frame copied off a video element is a full-resolution PNG - a megabyte or
 * two once it is a data URL. That is fine to hold in the page and hopeless to
 * send: signals carry 8KB each, so an untouched capture would be several
 * hundred of them in a burst, and the session would throttle long before the
 * picture arrived.
 *
 * So a capture is shrunk once, at the moment it is taken, and the smaller image
 * is what gets taped in as well as what gets sent. Both people then see the
 * same picture, and the card it renders into is a few hundred pixels wide in
 * any case - the full resolution was never visible to anyone.
 *
 * JPEG for both kinds, including the whiteboard. It loses a little crispness on
 * line art, which is the right trade for a thing the notebook treats as a
 * photograph of a whiteboard rather than as the board itself: the board stays
 * live and vector on its own tab, and this is the snapshot taped beside it.
 */

/** The longest edge a shared capture may have. */
const MAX_EDGE = 1000;

/** Roughly sixteen signals once base64 and the envelope are counted. */
const BYTE_BUDGET = 96_000;

/** Tried in order until one fits the budget. */
const QUALITY_STEPS = [0.82, 0.7, 0.58, 0.45];

function draw(image: HTMLImageElement, scale: number): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  /* A white ground, because a transparent PNG flattens to black in JPEG and a
     whiteboard would arrive as a dark rectangle. */
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function load(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("could not read the capture"));
    image.src = dataUrl;
  });
}

/**
 * Shrink a capture until it is small enough to send.
 *
 * Returns the original if anything goes wrong: a capture that cannot be shrunk
 * is still a capture worth taping into your own notes, even if it is too big to
 * share. The caller decides whether to send it.
 */
export async function shrinkCapture(dataUrl: string): Promise<string> {
  try {
    const image = await load(dataUrl);
    const longest = Math.max(image.naturalWidth, image.naturalHeight);
    if (!longest) return dataUrl;

    const canvas = draw(image, Math.min(1, MAX_EDGE / longest));
    if (!canvas) return dataUrl;

    let best = dataUrl;
    for (const quality of QUALITY_STEPS) {
      const encoded = canvas.toDataURL("image/jpeg", quality);
      best = encoded;
      if (encoded.length <= BYTE_BUDGET) return encoded;
    }
    // Every step was still over budget; the smallest one is the best available.
    return best;
  } catch {
    return dataUrl;
  }
}

/** Whether a capture is small enough to put through the session. */
export function fitsInASignal(dataUrl: string): boolean {
  return dataUrl.length <= BYTE_BUDGET;
}
