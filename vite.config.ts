import { defineConfig } from 'vitest/config';

const domTestFiles = [
  'tests/characterPicker.test.ts',
  'tests/characterPreviewSystem.test.ts',
  'tests/debugPanel.test.ts',
  'tests/diagnosticRecorder.test.ts',
  'tests/dialogueUI.test.ts',
  'tests/gamepadInput.test.ts',
  'tests/healthHud.test.ts',
  'tests/helpOverlay.test.ts',
  'tests/input.test.ts',
  'tests/inputOwnershipInspector.test.ts',
  'tests/interactions.test.ts',
  'tests/loadingScreen.test.ts',
  'tests/locationHud.test.ts',
  'tests/quickbar.test.ts',
];

export default defineConfig({
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
  build: { sourcemap: true },
  test: {
    globals: true,
    coverage: { reporter: ['text', 'html'] },
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: domTestFiles,
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: domTestFiles,
        },
      },
    ],
  },
});
