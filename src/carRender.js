export const CAR_RENDER_SIZE = 125;
const CAR_ROTATION_OFFSET = -Math.PI / 2;

export function drawCarSprite(ctx, img, pos, heading, renderSize = CAR_RENDER_SIZE) {
  if (!img) {
    return;
  }

  const maxDim = Math.max(img.width, img.height) || 1;
  const scale = renderSize / maxDim;
  const width = img.width * scale;
  const height = img.height * scale;

  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(heading + CAR_ROTATION_OFFSET);
  ctx.drawImage(img, -width / 2, -height / 2, width, height);
  ctx.restore();
}
