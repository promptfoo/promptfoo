type ImageReference =
  | { image_url: string; file_id?: never }
  | { file_id: string; image_url?: never };

export type ImageEditOptions = {
  operation: 'edit';
  images: ImageReference[];
  markup?: ImageReference;
  mask?: ImageReference;
};

function isImageReference(value: unknown, pngOnly = false): value is ImageReference {
  if (typeof value !== 'object' || value === null || Object.keys(value).length !== 1) {
    return false;
  }
  if ('file_id' in value) {
    return typeof value.file_id === 'string' && value.file_id.trim().length > 0;
  }
  if (!('image_url' in value) || typeof value.image_url !== 'string') {
    return false;
  }
  const url = value.image_url;
  if (url.startsWith('data:')) {
    const format = /^data:\s*image\/(png|jpeg|webp)\s*(?:;[^,]*)?;base64,.+$/.exec(url)?.[1];
    return format !== undefined && (!pngOnly || format === 'png');
  }
  return URL.canParse(url) && new URL(url).protocol === 'https:';
}

export function validateImageEditConfig(config: Record<string, unknown>): string | undefined {
  if (
    config.image !== undefined ||
    config.input_fidelity !== undefined ||
    config.prompt_rewriter !== undefined
  ) {
    return 'Use images for JSON edits and omit image, input_fidelity, and prompt_rewriter.';
  }
  if (
    !Array.isArray(config.images) ||
    config.images.length < 1 ||
    config.images.length > 16 ||
    !config.images.every((item) => isImageReference(item))
  ) {
    return 'images must contain 1 to 16 image references, each with a file_id or an image_url (HTTPS or a base64 PNG, JPEG, or WebP data URL).';
  }
  if (config.markup !== undefined && config.mask !== undefined) {
    return 'Choose either markup or mask for an image edit.';
  }
  for (const field of ['markup', 'mask'] as const) {
    if (config[field] !== undefined && !isImageReference(config[field], true)) {
      return `${field} must reference a PNG using a file_id or an image_url (HTTPS or a base64 PNG data URL).`;
    }
  }
  if (config.output_format === 'svg' || config.output_format === 'gif') {
    return 'SVG and GIF output formats are only supported for image generation.';
  }
  return undefined;
}
