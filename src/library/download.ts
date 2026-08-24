/**
 * Hand bytes to the user as a file. Shared by the .syx and .zip exports.
 *
 * How that happens is the platform's business: a download link in the browser, a save panel in the
 * plugin. Callers only ever want the bytes to end up somewhere the user chose.
 */

import { platform } from '@platform'

export function download(name: string, bytes: Uint8Array, type = 'application/octet-stream'): void {
  platform.saveFile(name, bytes, type)
}
