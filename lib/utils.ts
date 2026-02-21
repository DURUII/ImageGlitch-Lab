type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | Record<string, boolean>
  | ClassValue[]

export function cn(...inputs: ClassValue[]): string {
  const classes: string[] = []

  const pushValue = (value: ClassValue) => {
    if (!value) return

    if (typeof value === 'string' || typeof value === 'number') {
      classes.push(String(value))
      return
    }

    if (Array.isArray(value)) {
      value.forEach(pushValue)
      return
    }

    Object.entries(value).forEach(([key, enabled]) => {
      if (enabled) classes.push(key)
    })
  }

  inputs.forEach(pushValue)
  return classes.join(' ')
}
