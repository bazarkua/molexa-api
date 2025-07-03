#
![moleXa Logo](public/android-chrome-512x512.png)

# moleXa-backend

An educational Node.js proxy server for PubChem APIs, designed to enrich molecular data access, provide enhanced features, and support learning through interactive documentation and real-time analytics.

---

## Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Getting Started](#getting-started)

   * [Prerequisites](#prerequisites)
   * [Installation](#installation)
   * [Usage](#usage)
   * [Running Tests](#running-tests)
4. [API Endpoints](#api-endpoints)
5. [Contributing](#contributing)
6. [Citations](#citations)
7. [License](#license)

---

## Features

* **PubChem Proxy**: Overcomes CORS limitations by forwarding requests to PubChem PUG-REST and PUG-View.
* **Educational Annotations**: Retrieves and annotates molecular properties, safety data, pharmacology, and more.
* **Autocomplete**: Suggests chemical names for an enhanced search experience.
* **Structure Visualization**: Supports 2D and 3D molecular representations.
* **Live Analytics**: Optional real-time dashboard tracks API usage and performance.
* **Rate Limiting & Caching**: Protects the API and improves response times.

---

## Tech Stack

* **Node.js** ≥ 14.0.0
* **Express** v4.18.2
* **CORS** v2.8.5
* **node-fetch** v2.7.0
* **express-rate-limit** v6.10.0
* **node-cache** v5.1.2
* **supabase-js** (for optional DB analytics)
* **nodemon** v3.0.1 (development)

---

## Getting Started

### Prerequisites

* [Node.js](https://nodejs.org/) ≥ 14.x
* [npm](https://www.npmjs.com/) or [Yarn](https://yarnpkg.com/)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/bazarkua/molexa-api.git
   cd molexa-api
   ```

2. **Install dependencies**

   ```bash
   npm install
   # or yarn install
   ```

### Usage

* **Production Mode**

  ```bash
  npm start
  ```

* **Development Mode**

  ```bash
  npm run dev
  ```

### Running Tests

```bash
npm test
# or yarn test
```

---

## API Endpoints

| Purpose                         | Endpoint                                   | Method |
| ------------------------------- | ------------------------------------------ | ------ |
| Health check                    | `/health`                                  | GET    |
| API docs (interactive Swagger)  | `/api/docs`                                | GET    |
| JSON API spec                   | `/api/json/docs`                           | GET    |
| Educational overview            | `/api/pubchem/compound/{cid}/educational`  | GET    |
| Safety annotations              | `/api/pugview/compound/{cid}/safety`       | GET    |
| Pharmacology data               | `/api/pugview/compound/{cid}/pharmacology` | GET    |
| Chemical properties             | `/api/pugview/compound/{cid}/properties`   | GET    |
| Autocomplete (name suggestions) | `/api/autocomplete/{query}`                | GET    |
| Headings by topic               | `/api/pugview/headings/{topic}`            | GET    |
| PubChem proxy (any PUG-REST)    | `/api/pubchem/*`                           | GET    |
| Analytics summary               | `/api/analytics`                           | GET    |
| Analytics SSE stream            | `/api/analytics/stream`                    | GET    |

---

## Contributing

Contributions and improvements are welcome! To contribute:

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request.

Be sure to follow the existing code style and include tests for new functionality.

---

## Citations

When using this API in research or educational materials, please cite both the software and the underlying PubChem database:

**This API Software**

**APA:** Bazarkulov, A. (2025). *moleXa API: PubChem Educational Proxy* (v2.0.0) \[Computer software]. GitHub. [https://github.com/bazarkua/molexa-api](https://github.com/bazarkua/molexa-api)

**PubChem Database**

Kim, S., Chen, J., Cheng, T., Gindulyte, A., He, J., Li, Q., et al. (2023). PubChem 2023 update. *Nucleic Acids Research*, 51(D1), D1373–D1380. [https://doi.org/10.1093/nar/gkac956](https://doi.org/10.1093/nar/gkac956)

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
