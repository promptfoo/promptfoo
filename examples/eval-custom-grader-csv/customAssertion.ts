export default function (output, context) {
  return output.toLowerCase().includes('ahoy') || output.toLowerCase().includes('bonjour');
}
