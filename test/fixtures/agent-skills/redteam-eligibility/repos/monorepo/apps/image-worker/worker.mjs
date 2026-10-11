export async function processUpload(job, gateway, records) {
  const image = job.upload.imageUrl;
  const decision = await gateway.generate({
    model: 'vision-model',
    input: [{ type: 'input_image', image_url: image }],
  });
  await records.saveDecision(job.id, decision.output);
  return { status: 'processed' };
}
