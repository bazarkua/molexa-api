# moleXa API Backend

<div align="center">
  <img src="./public/mox_logo.png" alt="moleXa Logo" width="200"/>
  
  [![GitHub stars](https://img.shields.io/github/stars/bazarkua/molexa-api?style=social)](https://github.com/bazarkua/molexa-api/stargazers)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)
  [![Express](https://img.shields.io/badge/Express-4.18+-black)](https://expressjs.com/)
  [![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black)](https://vercel.com/)
</div>

## What is this?

This is the backend API that powers [molexa.org](https://molexa.org). I built it because the PubChem API has CORS restrictions and lacks educational context that students need. Instead of just proxying requests, I enhanced it with autocomplete suggestions, safety information, and educational explanations.

## Why I made this

When building the moleXa frontend, I needed a reliable way to fetch molecular data from PubChem without running into CORS issues. But more importantly, I wanted to add educational value - things like explaining what molecular properties mean, providing safety warnings, and offering smart search suggestions. The result is an API that's specifically designed for chemistry education.

## Key Features

- **CORS-enabled PubChem proxy** - Access any PubChem endpoint from web applications
- **Educational enhancements** - Contextual explanations for molecular properties
- **Smart autocomplete** - Chemical name suggestions as you type
- **Safety information** - Toxicity data and handling procedures
- **Analytics tracking** - Usage statistics for educational impact
- **Caching system** - Fast responses with intelligent cache management
- **Rate limiting** - Respects PubChem's 5 requests/second limit

## Quick Start

```bash
# Clone the repo
git clone https://github.com/bazarkua/molexa-api.git
cd molexa-api

# Install dependencies
npm install

# Set up environment variables (optional)
cp .env.example .env

# Start development server
npm run dev

# Test the API
curl http://localhost:3001/api/health
```

## Main Endpoints

### Educational Overview
Get comprehensive data with educational context:
```
GET /api/pubchem/compound/{name}/educational?type=name
```

### Smart Autocomplete
Chemical name suggestions:
```
GET /api/autocomplete/{query}?limit=5
```

### Safety Information
Toxicity and handling data:
```
GET /api/pugview/compound/{cid}/safety?heading=Toxicity
```

### PubChem Proxy
Direct access to any PubChem endpoint:
```
GET /api/pubchem/compound/name/aspirin/cids/JSON
GET /api/pubchem/compound/cid/2244/PNG
```

## Examples

Search for caffeine and get educational data:
```bash
curl "https://molexa-api.vercel.app/api/pubchem/compound/caffeine/educational?type=name"
```

Get autocomplete suggestions:
```bash
curl "https://molexa-api.vercel.app/api/autocomplete/caffe?limit=5"
```

Fetch safety information for aspirin:
```bash
curl "https://molexa-api.vercel.app/api/pugview/compound/2244/safety?heading=Toxicity"
```

## Environment Variables

```bash
# Optional - for analytics storage
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key

# Optional - for admin features
ADMIN_TOKEN=your_admin_token

# Optional - for data privacy
HASH_SALT=your_hash_salt
```

## Deployment

The API is deployed on Vercel and automatically builds from the main branch. It's configured to work as a serverless function with proper caching and rate limiting.

```bash
# Deploy to Vercel
vercel --prod

# Or use the GitHub integration for automatic deployments
```

## Analytics

The API tracks educational usage patterns to understand how students and educators use molecular data. All tracking is privacy-focused with hashed IP addresses and focuses on educational impact metrics.

View live analytics at: [https://molexa-api.vercel.app/api/docs](https://molexa-api.vercel.app/api/docs)

## Development

```bash
# Start with hot reloading
npm run dev

# Run tests
npm test

# Check API health
npm run validate
```

## API Documentation

- **Interactive docs**: [https://molexa-api.vercel.app/api/docs](https://molexa-api.vercel.app/api/docs)
- **JSON specification**: [https://molexa-api.vercel.app/api/json/docs](https://molexa-api.vercel.app/api/json/docs)
- **Live analytics**: [https://molexa-api.vercel.app/api/analytics](https://molexa-api.vercel.app/api/analytics)

## Tech Stack

- **Node.js & Express** - Core server framework
- **Vercel** - Serverless deployment platform
- **Supabase** - Analytics database (optional)
- **node-cache** - In-memory caching
- **express-rate-limit** - API rate limiting

## Contributing

I welcome contributions, especially from educators who know what students need. Feel free to open issues for feature requests or submit PRs for improvements.

## Citation

If you use this API in research or educational materials, please cite:

```
Bazarkulov, A. (2025). moleXa API: PubChem Educational Proxy API (Version 2.2.0) [Computer software]. 
GitHub. https://github.com/bazarkua/molexa-api
```

And don't forget to cite PubChem:
```
Kim, S., Chen, J., Cheng, T., et al. (2025). PubChem 2025 update. 
Nucleic Acids Research, 53(D1), D1516–D1525. https://doi.org/10.1093/nar/gkae1059
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Links

- **Live API**: [https://molexa-api.vercel.app](https://molexa-api.vercel.app)
- **Frontend**: [https://molexa.org](https://molexa.org)
- **Frontend repo**: [https://github.com/bazarkua/molexa](https://github.com/bazarkua/molexa)
- **PubChem**: [https://pubchem.ncbi.nlm.nih.gov](https://pubchem.ncbi.nlm.nih.gov)