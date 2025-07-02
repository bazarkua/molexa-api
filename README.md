#
![moleXa Logo](static/android-chrome-512x512.png)

# moleXa-backend

An educational backend proxy server for PubChem API access with enhanced molecular data and features.

## Tech Stack

- **Node.js** ≥ 14.0.0
- **Express** v4.18.2
- **CORS** v2.8.5
- **node-fetch** v2.7.0
- **express-rate-limit** v6.10.0
- **node-cache** v5.1.2
- **nodemon** v3.0.1 (development)

## Installation and Usage

1. **Clone the repository**
   ```bash
   git clone https://github.com/bazarkua/molexa-api.git
   cd molexa-api
   ```
2. **Install dependencies**
   ```bash
   npm install
   ```
3. **Run in production mode**
   ```bash
   npm start
   ```
4. **Run in development mode**
   ```bash
   npm run dev
   ```
5. **Run tests**
   ```bash
   npm test
   ```

If you find this project useful, please consider giving it a star on GitHub.

## Features

- **PubChem Proxy**: Addresses CORS issues and forwards requests to PubChem PUG-REST and PUG-View APIs.
- **Educational Data**: Retrieves and annotates molecular properties, safety, pharmacology, and more.
- **Autocomplete**: Provides chemical name suggestions for improved search experience.
- **Live Analytics**: (Optional) Tracks API usage and offers a real-time dashboard.
- **Structure Visualization**: Supports 2D/3D molecular representations.

## API Endpoints

| Purpose                           | Endpoint                                       |
| --------------------------------- | ---------------------------------------------- |
| Health check                      | `GET /health`                                  |
| Interactive docs                  | `GET /docs`                                    |
| JSON API documentation            | `GET /api/docs`                                |
| Educational overview              | `GET /api/pubchem/compound/{id}/educational`   |
| Safety annotations                | `GET /api/pugview/compound/{cid}/safety`       |
| Pharmacology data                 | `GET /api/pugview/compound/{cid}/pharmacology` |
| Chemical properties               | `GET /api/pugview/compound/{cid}/properties`   |
| Autocomplete                      | `GET /api/autocomplete/{query}`                |
| Educational headings              | `GET /api/pugview/headings/{topic}`            |
| PubChem proxy (any PUG-REST path) | `GET /api/pubchem/*`                           |

## Contributing

This is an educational project developed by Adilbek Bazarkulov with assistance from Claude AI. Contributions are welcome; feel free to open a pull request with improvements.

## Credits and Citations

#### \*\* How to Cite This API\*\*

When using this educational proxy API in research, publications, or educational materials, please cite both this software and the underlying PubChem database:

##### **This API Software:**

**APA Format:**\
Bazarkulov, A. (2025). *moleXa API: PubChem Educational Proxy API* (Version 2.0.0) [Computer software]. GitHub. [**https://github.com/bazarkua/molexa-api**](https://github.com/bazarkua/molexa-api)

##### **PubChem Database:**

**Primary Citation:**\
Kim, S., Chen, J., Cheng, T., Gindulyte, A., He, J., He, S., Li, Q., Shoemaker, B. A., Thiessen, P. A., Yu, B., Zaslavsky, L., Zhang, J., & Bolton, E. E. (2023). PubChem 2023 update. *Nucleic Acids Research*, 51(D1), D1373–D1380. [**https://doi.org/10.1093/nar/gkac956**](https://doi.org/10.1093/nar/gkac956)


## License

This project is licensed under the MIT License.

