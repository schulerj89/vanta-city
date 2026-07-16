# Dialogue system

Vanta City dialogue is a linear, data-driven runtime feature. It uses the existing `GameStateMachine` and enters its `dialogue` state for the lifetime of a session. Player movement and normal interactions already accept input only in `playing`, so dialogue does not add a competing pause or control system.

## Conversation data

A `ConversationDefinition` has a stable logical `id`, one or more ordered lines, optional cancellation, and an optional completion hook. Every line has a stable ID, speaker ID, text, and optional portrait, next-line, and entry hook metadata.

```ts
const introduction: ConversationDefinition = {
  id: 'mack.introduction',
  canCancel: true,
  lines: [
    {
      id: 'mack.introduction.late',
      speakerId: 'mack',
      text: 'You’re late.',
      onEnter: { id: 'conversation.mack-introduction.entered' },
    },
    {
      id: 'mack.introduction.reply',
      speakerId: 'rook',
      text: 'I know.',
      // Omit nextLine to use the next ordered line.
      nextLine: 'mack.introduction.close',
      portraitOverride: { src: '/assets/portraits/rook.webp' },
    },
    {
      id: 'mack.introduction.close',
      speakerId: 'mack',
      text: 'Then move.',
    },
  ],
  onComplete: { id: 'conversation.mack-introduction.completed' },
};
```

`nextLine` supports an explicit linear jump, not player choices. IDs and references are validated when a session starts. Empty conversations, empty text, duplicate line IDs, and missing next-line targets fail immediately. Missing speaker metadata remains safe: the UI shows “Unknown speaker” and a stable `?` portrait.

Entry and completion hooks are emitted as `dialogue:hook` facts. Future mission code may subscribe through an adapter; dialogue does not import or implement missions.

## Public session API

`DialogueSessionController` is the public owner of a single active session:

- `start(conversation)` enters `dialogue`, displays the first line, and returns a promise resolving to a completed or cancelled outcome. Starting while another session is active throws without replacing it.
- `advance()` completes partially revealed text first. Calling it again advances to the next line; advancing the final complete line finishes the conversation.
- `skipTypewriter()` immediately reveals the current line without advancing.
- `cancel()` returns `false` if no cancellable session is active. Otherwise it closes the session, returns to `playing`, emits cancellation, and resolves the completion promise.
- `setTypewriterEnabled(enabled)` is the accessibility and deterministic-test control. Disabling it immediately reveals the current text.
- `getSnapshot()` and `getCurrentLine()` provide read-only state for UI, debugging, and browser tests.

The controller emits `dialogue:started`, `dialogue:line-changed`, `dialogue:completed`, `dialogue:cancelled`, and `dialogue:hook`. Optional `DialogueCameraHooks` receive start, line-change, and end notifications; they request no camera position and do not own a camera.

## Speakers and portraits

Register speaker names and optional portrait URLs in `src/dialogue/speakers.ts`. A line-level `portraitOverride` wins, followed by selected-player identity, speaker portrait, and fallback initials. Rook uses the selected player identity source. The current character catalog has no portrait URLs, so Rook safely displays initials derived from the selected character until one becomes available.

Image load errors replace the image with the same initials fallback. Portrait resolution is visible through the debug panel, `DialogueUISystem.getDebugSnapshot()`, and the opt-in browser-test bridge.

## Input, accessibility, and tests

Named actions are defined in `defaultBindings`:

- `advanceDialogue`: Enter, Space, or primary mouse button
- `skipDialogueTypewriter`: F
- `cancelDialogue`: Escape, when the conversation permits cancellation

The typewriter defaults to 42 Unicode characters per second. It is disabled automatically for `prefers-reduced-motion: reduce`, or explicitly with `?dialogueTypewriter=0`. Tests can call `setTypewriterEnabled(false)` rather than waiting on wall-clock time.

During development, use the debug commands `dialogue.start-mack`, `dialogue.advance`, and `dialogue.set-typewriter on|off`. With `?e2e=1`, `window.__VANTA_TEST__.snapshot().dialogue` exposes session state, rendered UI data, portrait resolution, and completed/cancelled conversation IDs. This bridge remains development-only.
