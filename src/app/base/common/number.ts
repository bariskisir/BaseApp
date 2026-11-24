export const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum)

const countDecimals = (step: number): number => {
  const serialized = String(step)
  const decimalIndex = serialized.indexOf('.')
  return decimalIndex === -1 ? 0 : serialized.length - decimalIndex - 1
}

export const snapToStep = (
  value: number,
  minimum: number,
  maximum: number,
  step: number,
): number => {
  const clamped = clamp(value, minimum, maximum)
  const snapped = Math.round((clamped - minimum) / step) * step + minimum
  const precision = countDecimals(step)
  return clamp(Number(snapped.toFixed(precision)), minimum, maximum)
}
