const DEFAULT_PARALLAX = 0.2;
const DEFAULT_Y_OFFSET = 0.2;

export function drawSkylineLayer(ctx, cameraPos, img, options = {}) {
  if (!img) {
    return false;
  }

  const parallax = options.parallaxFactor ?? DEFAULT_PARALLAX;
  const alpha = options.alpha ?? 1;
  const pixelScale = options.pixelScale ?? 1;
  const yOffset = options.yOffset ?? DEFAULT_Y_OFFSET;
  const scale = options.scale ?? 1;
  const hazeStrength = options.hazeStrength ?? 0;
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const offsetX = -cameraPos.x * parallax * pixelScale;
  const drawY = height * yOffset;
  const tileWidth = (img.width || 1) * scale;
  const tileHeight = (img.height || 1) * scale;
  const startX = ((offsetX % tileWidth) + tileWidth) % tileWidth - tileWidth;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;

  for (let x = startX; x < width + tileWidth; x += tileWidth) {
    ctx.drawImage(img, x, drawY, tileWidth, tileHeight);
  }
  if (hazeStrength > 0) {
    const hazeAlpha = Math.min(0.6, hazeStrength) * alpha;
    const gradient = ctx.createLinearGradient(0, 0, 0, height * 0.65);
    gradient.addColorStop(0, `rgba(12, 12, 26, ${hazeAlpha})`);
    gradient.addColorStop(1, `rgba(12, 12, 26, 0)`);
    ctx.globalAlpha = 1;
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();
  return true;
}

export function drawSkylineFallback(ctx) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const gradient = ctx.createLinearGradient(0, 0, 0, height * 0.7);
  gradient.addColorStop(0, "#0b0a24");
  gradient.addColorStop(1, "#1b0c2a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
