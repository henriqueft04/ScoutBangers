import { loadEnv } from 'vite'
const env = loadEnv('development', process.cwd(), '')
console.log('REFRESH_TOKEN:', env.GOOGLE_REFRESH_TOKEN ? 'exists' : 'missing')
