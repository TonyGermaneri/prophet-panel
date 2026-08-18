/** Hand bytes to the browser as a file. Shared by the .syx and .zip exports. */
export function download(name: string, bytes: Uint8Array, type = 'application/octet-stream'): void {
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer as BlobPart], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
