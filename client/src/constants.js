export const ROLE_KEYWORDS = [
  'strategy', 'product manager', 'product management', 'operations',
  'go-to-market', 'gtm', 'ai operations', 'ai strategy',
  'business operations', 'corporate strategy', 'strategic',
  'operations lead', 'operations manager', 'venture capital',
  'corporate vc', 'corporate venture', 'investing', 'investment',
  'portfolio', 'product lead', 'program manager', 'chief of staff',
  'ai agent', 'agentic', 'agent operations', 'agent product',
  'generative ai', 'gen ai', 'llm', 'foundation model',
]

export const STATUSES = [
  { value: 'Not Applied', color: '#4a6080' },
  { value: 'Applied',     color: '#16a34a' },
  { value: 'Interviewing',color: '#d97706' },
  { value: 'Offer',       color: '#7c3aed' },
  { value: 'Rejected',    color: '#dc2626' },
  { value: 'Withdrawn',   color: '#6b7280' },
]

export const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.value, s.color]))

export const COMPANY_PORTALS = [
  {
    name: 'Google',
    links: [
      { label: 'Product Management', url: 'https://www.google.com/about/careers/applications/jobs/results?category=PRODUCT_MANAGEMENT&jlo=en_US&q=' },
      { label: 'Strategy & Ops', url: 'https://www.google.com/about/careers/applications/jobs/results?category=BUSINESS_STRATEGY&jlo=en_US&q=' },
    ],
  },
  {
    name: 'Amazon',
    links: [
      { label: 'Product Manager', url: 'https://www.amazon.jobs/en/search?base_query=product+manager&loc_query=United+States&job_type=Full-Time&sort=relevant' },
      { label: 'Strategy & Ops', url: 'https://www.amazon.jobs/en/search?base_query=strategy+operations&loc_query=United+States&job_type=Full-Time&sort=relevant' },
      { label: 'VC / Investing', url: 'https://www.amazon.jobs/en/search?base_query=venture+capital+investing&loc_query=United+States&sort=relevant' },
    ],
  },
  {
    name: 'Microsoft',
    links: [
      { label: 'Product Manager', url: 'https://careers.microsoft.com/v2/global/en/search?q=product+manager&lc=United+States&l=en_us&pg=1&pgSz=20&o=Recent' },
      { label: 'Strategy & Ops', url: 'https://careers.microsoft.com/v2/global/en/search?q=strategy+operations&lc=United+States&l=en_us&pg=1&pgSz=20&o=Recent' },
    ],
  },
  {
    name: 'Meta',
    links: [
      { label: 'Product Manager', url: 'https://www.metacareers.com/jobs?teams%5B0%5D=Product%20Management&offices%5B0%5D=United%20States' },
      { label: 'Strategy & Ops', url: 'https://www.metacareers.com/jobs?q=strategy%20operations&offices%5B0%5D=United%20States' },
    ],
  },
  {
    name: 'Apple',
    links: [
      { label: 'Product Management', url: 'https://jobs.apple.com/en-us/search?search=product+manager&sort=relevance' },
      { label: 'Strategy & Ops', url: 'https://jobs.apple.com/en-us/search?search=strategy+operations&sort=relevance' },
    ],
  },
  {
    name: 'Salesforce',
    links: [
      { label: 'Product Manager', url: 'https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site?q=product+manager' },
      { label: 'Strategy & Ops', url: 'https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site?q=strategy+operations' },
    ],
  },
]

export const QUICK_LINKS = [
  { label: 'LinkedIn',    url: 'https://www.linkedin.com/jobs/search/?keywords=%22product+manager%22+OR+%22strategy%22+OR+%22venture+capital%22+OR+%22operations+manager%22&f_I=96&f_TPR=r604800&sortBy=DD' },
  { label: 'PitchBook',   url: 'https://pitchbook.com/careers' },
  { label: 'Glocap',      url: 'https://www.glocap.com/jobs/' },
  { label: 'VentureBeat', url: 'https://venturebeat.com/jobs/' },
  { label: 'VentureLoop', url: 'https://www.ventureloop.com/ventureloop/job_search.php?s=product+manager&submit=Search+Jobs' },
  { label: 'Dice',        url: 'https://www.dice.com/jobs?q=%22product+manager%22+OR+%22strategy+and+operations%22+OR+%22venture+capital%22&l=United+States&datePosted=7' },
]
