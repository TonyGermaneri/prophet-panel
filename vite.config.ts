import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // localhost is a secure context, so Web MIDI (including sysex) works without TLS.
    host: 'localhost',
  },
  // The factory .syx files live outside src/ and are pulled in as raw bytes by the
  // library seeder via import.meta.glob.
  assetsInclude: ['**/*.syx'],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
