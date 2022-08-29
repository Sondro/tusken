import { exec } from 'child_process'
import EventEmitter from 'events'
import { extractSchemas } from 'extract-pg-schema'
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import { Client } from 'pg'
import { StrictEventEmitter } from 'strict-event-emitter-types'
import { promisify } from 'util'
import { ClientConfig } from './config'
import { extractNativeFuncs } from './extract'
import { generateNativeFuncs } from './typescript/generateNativeFuncs'
import { generateTypeSchema } from './typescript/generateSchema'

type Events = {
  extractStart: () => void
  generateStart: () => void
  generateEnd: () => void
  write: () => void
  error: (e: any) => void
}

export interface Generator extends StrictEventEmitter<EventEmitter, Events> {
  /** Generate and write the files. */
  update(): Promise<void>
}

export function generate(
  outDir: string,
  config: ClientConfig,
  configPath: string | undefined
): Generator {
  const generator = new EventEmitter() as Generator
  generator.update = async () => {
    try {
      generator.emit('extractStart')
      const client = new Client(config)
      await client.connect()
      const nativeFuncs = await extractNativeFuncs(client)
      await client.end()
      const extracted = await extractSchemas(config)
      generator.emit('generateStart')
      const files = generateTypeSchema(extracted.public, outDir, configPath)
      files.push({
        name: 'functions.ts',
        content: generateNativeFuncs(nativeFuncs),
      })
      files.push({
        name: 'schema.sql',
        content: await dumpSqlSchema(config),
      })
      generator.emit('generateEnd')
      mkdirSync(outDir, { recursive: true })
      for (const file of files) {
        writeFileSync(path.join(outDir, file.name), file.content)
      }
      generator.emit('write')
    } catch (e: any) {
      generator.emit('error', e)
    }
  }
  process.nextTick(generator.update)
  return generator
}

async function dumpSqlSchema(conn: ClientConfig) {
  const password =
    typeof conn.password == 'function' ? await conn.password() : conn.password

  const env = {
    ...process.env,
    PGPASSWORD: password,
  }

  const { stdout, stderr } = await promisify(exec)(
    `pg_dump -h ${conn.host} -p ${conn.port} -U "${conn.user}" "${conn.database}" --schema-only -E utf8`,
    { encoding: 'utf8', env }
  )

  if (stderr) {
    console.error(stderr)
  }
  return stdout.replace(/^(--.*?|)\n/gm, '')
}
