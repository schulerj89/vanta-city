/** Settles short, promise-only test workflows without real polling delays. */
export async function flushPromises(iterations = 4): Promise<void> {
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve();
  }
}
