const KEYS = {
  applications:    'jt_applications',
  resumes:         'jt_resumes',
  companies:       'jt_companies',
  ashbyCompanies:  'jt_ashby_companies',
  leverCompanies:  'jt_lever_companies',
  emailConfig:     'jt_email_config',
}

export const DEFAULT_COMPANIES = [
  // Original verified
  { slug: 'stripe',           name: 'Stripe' },
  { slug: 'airbnb',           name: 'Airbnb' },
  { slug: 'figma',            name: 'Figma' },
  { slug: 'databricks',       name: 'Databricks' },
  { slug: 'anthropic',        name: 'Anthropic' },
  { slug: 'coinbase',         name: 'Coinbase' },
  { slug: 'scaleai',          name: 'Scale AI' },
  { slug: 'airtable',         name: 'Airtable' },
  { slug: 'vercel',           name: 'Vercel' },
  { slug: 'lattice',          name: 'Lattice' },
  { slug: 'brex',             name: 'Brex' },
  { slug: 'carta',            name: 'Carta' },
  { slug: 'gusto',            name: 'Gusto' },
  // AI / infra
  { slug: 'xai',              name: 'xAI' },
  { slug: 'gleanwork',        name: 'Glean' },
  { slug: 'snorkelai',        name: 'Snorkel AI' },
  { slug: 'abnormalsecurity', name: 'Abnormal Security' },
  { slug: 'nuro',             name: 'Nuro' },
  // Fintech / consumer
  { slug: 'robinhood',        name: 'Robinhood' },
  { slug: 'instacart',        name: 'Instacart' },
  { slug: 'doordashusa',      name: 'DoorDash' },
  { slug: 'lyft',             name: 'Lyft' },
  { slug: 'affirm',           name: 'Affirm' },
  { slug: 'chime',            name: 'Chime' },
  { slug: 'flexport',         name: 'Flexport' },
  { slug: 'faire',            name: 'Faire' },
  { slug: 'checkr',           name: 'Checkr' },
  { slug: 'toast',            name: 'Toast' },
  // SaaS / dev tools
  { slug: 'reddit',           name: 'Reddit' },
  { slug: 'dropbox',          name: 'Dropbox' },
  { slug: 'twilio',           name: 'Twilio' },
  { slug: 'okta',             name: 'Okta' },
  { slug: 'mongodb',          name: 'MongoDB' },
  { slug: 'elastic',          name: 'Elastic' },
  { slug: 'gitlab',           name: 'GitLab' },
  { slug: 'cloudflare',       name: 'Cloudflare' },
  { slug: 'datadog',          name: 'Datadog' },
  { slug: 'pinterest',        name: 'Pinterest' },
  { slug: 'asana',            name: 'Asana' },
  { slug: 'discord',          name: 'Discord' },
  { slug: 'duolingo',         name: 'Duolingo' },
  { slug: 'squarespace',      name: 'Squarespace' },
  { slug: 'webflow',          name: 'Webflow' },
  { slug: 'samsara',          name: 'Samsara' },
  { slug: 'amplitude',        name: 'Amplitude' },
  { slug: 'mixpanel',         name: 'Mixpanel' },
  { slug: 'klaviyo',          name: 'Klaviyo' },
  { slug: 'intercom',         name: 'Intercom' },
  { slug: 'verkada',          name: 'Verkada' },
  // VC / investing
  { slug: 'a16z',             name: 'a16z' },
  { slug: 'generalcatalyst',  name: 'General Catalyst' },
]

export const DEFAULT_LEVER_COMPANIES = [
  { slug: 'palantir',  name: 'Palantir' },
  { slug: 'zoox',      name: 'Zoox' },
  { slug: 'mistral',   name: 'Mistral' },
  { slug: 'spotify',   name: 'Spotify' },
  { slug: 'kraken123', name: 'Kraken' },
  { slug: 'outreach',  name: 'Outreach' },
  { slug: 'nium',      name: 'Nium' },
  { slug: 'highspot',  name: 'Highspot' },
  { slug: 'neon',      name: 'Neon' },
  { slug: 'plaid',     name: 'Plaid' },
  { slug: 'increase',  name: 'Increase' },
]

export const DEFAULT_ASHBY_COMPANIES = [
  // AI / LLM
  { slug: 'openai',           name: 'OpenAI' },
  { slug: 'elevenlabs',       name: 'ElevenLabs' },
  { slug: 'harvey',           name: 'Harvey' },
  { slug: 'cohere',           name: 'Cohere' },
  { slug: 'sierra',           name: 'Sierra' },
  { slug: 'cognition',        name: 'Cognition (Devin)' },
  { slug: 'character',        name: 'Character.AI' },
  { slug: 'writer',           name: 'Writer' },
  { slug: 'decagon',          name: 'Decagon' },
  { slug: 'baseten',          name: 'Baseten' },
  { slug: 'modal',            name: 'Modal' },
  { slug: 'langchain',        name: 'LangChain' },
  { slug: 'abridge',          name: 'Abridge' },
  { slug: 'openevidence',     name: 'OpenEvidence' },
  // Fintech / SaaS
  { slug: 'ramp',             name: 'Ramp' },
  { slug: 'linear',           name: 'Linear' },
  { slug: 'replit',           name: 'Replit' },
  { slug: 'supabase',         name: 'Supabase' },
  { slug: 'vanta',            name: 'Vanta' },
  { slug: 'docker',           name: 'Docker' },
  { slug: 'watershed',        name: 'Watershed' },
  { slug: 'column',           name: 'Column' },
  { slug: 'browserbase',      name: 'Browserbase' },
  { slug: 'kalshi',           name: 'Kalshi' },
  // Previously added
  { slug: 'notion',           name: 'Notion' },
  { slug: 'retool',           name: 'Retool' },
  { slug: 'grammarly',        name: 'Grammarly' },
  { slug: 'runway',           name: 'Runway' },
  { slug: 'anyscale',         name: 'Anyscale' },
  { slug: 'pinecone',         name: 'Pinecone' },
  { slug: 'appliedintuition', name: 'Applied Intuition' },
  { slug: 'benchling',        name: 'Benchling' },
  { slug: 'gong',             name: 'Gong' },
  { slug: 'handshake',        name: 'Handshake' },
  { slug: 'rippling',         name: 'Rippling' },
  { slug: 'greylock',         name: 'Greylock' },
  { slug: 'indexventures',    name: 'Index Ventures' },
  { slug: 'insightpartners',  name: 'Insight Partners' },
]

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
}
function write(key, val) {
  localStorage.setItem(key, JSON.stringify(val))
}

export const storage = {
  getApplications:     () => read(KEYS.applications)   ?? [],
  saveApplications:    (v) => write(KEYS.applications, v),
  getResumes:          () => read(KEYS.resumes)         ?? [],
  saveResumes:         (v) => write(KEYS.resumes, v),
  getCompanies:        () => read(KEYS.companies)       ?? DEFAULT_COMPANIES,
  saveCompanies:       (v) => write(KEYS.companies, v),
  getAshbyCompanies:   () => read(KEYS.ashbyCompanies)  ?? DEFAULT_ASHBY_COMPANIES,
  saveAshbyCompanies:  (v) => write(KEYS.ashbyCompanies, v),
  getLeverCompanies:   () => read(KEYS.leverCompanies)  ?? DEFAULT_LEVER_COMPANIES,
  saveLeverCompanies:  (v) => write(KEYS.leverCompanies, v),
  getEmailConfig:      () => read(KEYS.emailConfig)     ?? {},
  saveEmailConfig:     (v) => write(KEYS.emailConfig, v),
}
