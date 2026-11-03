export function nextErrorToken(errors, offset) {
  return errors.find((t) => t.offset >= offset) ?? errors[0] ?? null;
}
