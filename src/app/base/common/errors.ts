export class CancellationError extends Error {
  constructor(message = 'Canceled') {
    super(message)
    this.name = 'CancellationError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export function toErrorMessage(error: unknown, verbose = false): string {
  if (!error) {
    return 'An unknown error occurred.'
  }

  if (error instanceof Error) {
    const detail = error.message || error.name
    if (verbose && error.stack) {
      return error.stack.includes(detail) ? error.stack : `${detail}\n${error.stack}`
    }
    return detail
  }

  if (typeof error === 'string') {
    return error
  }

  if (typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.length > 0) {
      return message
    }
  }

  return String(error)
}

type UnexpectedErrorHandler = (error: unknown) => void

let unexpectedErrorHandler: UnexpectedErrorHandler = (error: unknown): void => {
  console.error(error)
}

export function setUnexpectedErrorHandler(handler: UnexpectedErrorHandler): void {
  unexpectedErrorHandler = handler
}

export function onUnexpectedError(error: unknown): void {
  if (error instanceof CancellationError) {
    return
  }
  unexpectedErrorHandler(error)
}
