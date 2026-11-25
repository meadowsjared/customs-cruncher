import dotenv from 'dotenv'
import postgres from 'postgres'

dotenv.config()

const isReimport = process.argv.some(arg => arg.includes('importReplays') || arg.includes('reimportReplays'))
const hasDevArg = process.argv.includes(':dev') || process.argv.includes('--dev')
const hasProdArg = process.argv.includes(':prod') || process.argv.includes('--prod')

export const isProd = hasProdArg
  ? true
  : isReimport
    ? !hasDevArg && process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'dev'
    : process.env.NODE_ENV === 'production'
const connectionString = isProd ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL_DEV

if (!connectionString) {
  throw new Error(
    `Missing database connection string: expected ${isProd ? 'DATABASE_URL_PROD' : 'DATABASE_URL_DEV'} to be set in .env`
  )
}

export const sql = postgres(connectionString, { onnotice: () => {} })

export const db = sql
