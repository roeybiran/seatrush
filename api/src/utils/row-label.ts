export function rowLabel(index: number): string {
  let remaining = index + 1;
  let label = '';
  while (remaining > 0) {
    remaining--;
    label = String.fromCharCode(65 + remaining % 26) + label;
    remaining = Math.floor(remaining / 26);
  }
  return label;
}
