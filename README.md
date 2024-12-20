# ReSpace Protocol

## Usage

### Install requirements with pnpm

```bash
pnpm i
```

### Environment Setup

Before running tests or deploying contracts, you need to set up your environment variables:

1. Copy the `.env.example` file to `.env`:

    ```bash
    cp .env.example .env
    ```

2. Open the `.env` file and fill in the required information:

    ```text
    ACCOUNT_PRIVATE_KEY=your_private_key_here

    # sepolia arbitrum
    SEPOLIA_API_KEY=your_sepolia_api_key_here
    ```

### Testing

To run the tests:

```bash
pnpm test
```

### Code Coverage

To generate a code coverage report:

```bash
pnpm cov
```