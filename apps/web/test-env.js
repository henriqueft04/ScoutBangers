const { loadEnv } = require('vite')
const env = loadEnv('development', process.cwd(), '')
console.log(!!env.GOOGLE_SERVICE_ACCOUNT_JSON)
