import { randomUUID } from 'node:crypto'
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { timeout } from '../common/async'

const TEMPORARY_SUFFIX = '.tmp'
const RETRYABLE_RENAME_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])
const MAX_RENAME_RETRIES = 3

const createTemporaryPath = (filePath: string): string =>
  `${filePath}.${randomUUID()}${TEMPORARY_SUFFIX}`

const serializeJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

const isRetryableRenameError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false
  }
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' && RETRYABLE_RENAME_CODES.has(code)
}

const commitTemporaryFile = async (temporaryPath: string, filePath: string): Promise<void> => {
  for (let attempt = 0; attempt <= MAX_RENAME_RETRIES; attempt += 1) {
    try {
      await rename(temporaryPath, filePath)
      return
    } catch (error) {
      if (!isRetryableRenameError(error)) {
        throw error
      }
      if (attempt < MAX_RENAME_RETRIES) {
        await timeout(25 * (attempt + 1))
        continue
      }
      await copyFile(temporaryPath, filePath)
      await unlink(temporaryPath).catch(() => undefined)
      return
    }
  }
}

export const readTextFile = async (filePath: string): Promise<string> => readFile(filePath, 'utf8')

export const writeTextFileAtomic = async (filePath: string, content: string): Promise<void> => {
  await mkdir(dirname(filePath), { recursive: true })
  const temporaryPath = createTemporaryPath(filePath)
  try {
    await writeFile(temporaryPath, content, 'utf8')
    await commitTemporaryFile(temporaryPath, filePath)
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}

export const readJsonFile = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readTextFile(filePath))

export const readJsonFileSync = (filePath: string): unknown =>
  JSON.parse(readFileSync(filePath, 'utf8'))

export const writeJsonFileAtomic = async (filePath: string, value: unknown): Promise<void> => {
  await writeTextFileAtomic(filePath, serializeJson(value))
}

export const writeJsonFileSyncAtomic = (filePath: string, value: unknown): void => {
  mkdirSync(dirname(filePath), { recursive: true })
  const temporaryPath = createTemporaryPath(filePath)
  try {
    writeFileSync(temporaryPath, serializeJson(value), 'utf8')
    try {
      renameSync(temporaryPath, filePath)
    } catch (error) {
      if (!isRetryableRenameError(error)) {
        throw error
      }
      copyFileSync(temporaryPath, filePath)
      try {
        unlinkSync(temporaryPath)
      } catch {
        return
      }
    }
  } catch (error) {
    try {
      unlinkSync(temporaryPath)
    } catch {
      throw error
    }
    throw error
  }
}

export const removeInterruptedWrites = async (directoryPath: string): Promise<void> => {
  const entries = await readdir(directoryPath, { withFileTypes: true })
  await Promise.allSettled(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(TEMPORARY_SUFFIX))
      .map((entry) => unlink(join(directoryPath, entry.name))),
  )
}
