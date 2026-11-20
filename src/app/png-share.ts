/** A validated image remains in memory until the user explicitly shares or discards it. */
export interface SharePort {
  canShare(data: {files: File[]}): boolean;
  share(data: {files: File[]}): Promise<void>;
}

export function pngFile(dataUrl: string, filename: string): File {
  const bytes = atob(dataUrl.slice('data:image/png;base64,'.length));
  const result = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index++) result[index] = bytes.charCodeAt(index);
  return new File([result], filename, {type: 'image/png'});
}

/** Returns false when file sharing is not available; cancellation is left to the caller. */
export async function sharePng(port: SharePort | null, file: File): Promise<boolean> {
  const data = {files: [file]};
  if (!port || !port.canShare(data)) return false;
  await port.share(data);
  return true;
}
