# x-frontend
This is a simplified variant of the Cadent Frontend updated to use a
simple example calculator language (x-slang) to be used as a base for student projects.

## Getting Started

### Installation of Public Edition
1. First, make sure that you have the `x-slang` repository cloned
   locally, and have built it and have linked it.
2. Install a stable version of NodeJS. The active LTS or current version should work fine.
3. Clone this repository and navigate to it using "cd" in your command line or shell tool.
4. Run `yarn link x-slang` to use your local x-slang for x-frontend.
5. Run `yarn install` to install dependencies.
6. Run `yarn run start` to start the server at `localhost:8000`. **It might take a couple of minutes for the server to start.**
7. Point your browser to `http://localhost:8000` to see your local Source Academy.

## Development

### Running the tests
Before pushing to Github, ensure that your code is formatted and your tests are passing. These two commands should help with that:

- `yarn run format` : formats your code
- `yarn run test`: runs the tests and prints the output

### Contribution Guidelines

Refer to our issue tracker and contribute to any open issues you are able to spot there. If you have any new issues, please do post there as well. We welcome any form of contribution and are open to any new ideas you may have for the project!

To start contributing, create a fork from our repo and send a PR. Refer to [this article](https://help.github.com/en/articles/fork-a-repo) for more information.

### Application Structure

1. `assets` contains static assets.
1. `commons` contains components or other code common to more than one page.
1. `features` contains action creators, reducers and type declarations for specific functions.
1. `pages` contains pages and components used only in one page; its layout should mirror the actual routes.
1. `styles` contains all SCSS styles.

### TypeScript Coding Conventions

We reference [this guide](https://github.com/piotrwitek/react-redux-typescript-guide).

See also the [this standard in the wiki](https://github.com/source-academy/cadet-frontend/wiki/Coding-Standard).

