const CODING_SINCE = Date.parse("2015-08-01")
const YEAR = 1000 * 60 * 60 * 24 * 365

export default () => ({
  // As of the build, the site deploys often enough to keep it right
  codingYears: Math.floor((Date.now() - CODING_SINCE) / YEAR)
})
