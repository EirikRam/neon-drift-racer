export async function loadAssets(manifest) {
  const entries = Object.entries(manifest);
  const results = await Promise.all(
    entries.map(async ([key, src]) => {
      const image = new Image();
      image.src = src;

      if (image.decode) {
        await image.decode();
      } else {
        await new Promise((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = reject;
        });
      }

      return [key, image];
    }),
  );

  return Object.fromEntries(results);
}
