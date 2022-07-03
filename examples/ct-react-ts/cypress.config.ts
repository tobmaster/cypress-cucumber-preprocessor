import { defineConfig } from "cypress";

import * as Webpack from "webpack";

import { devServer } from "@cypress/webpack-dev-server";

const webpackConfig = (
  cypressConfig: Cypress.PluginConfigOptions
): Webpack.Configuration => {
  return {
    resolve: {
      extensions: [".js", ".ts", ".tsx"],
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          exclude: [/node_modules/],
          use: [
            {
              loader: "ts-loader",
              options: { transpileOnly: true },
            },
          ],
        },
        {
          test: /\.feature$/,
          use: [
            {
              loader: "@badeball/cypress-cucumber-preprocessor/webpack",
              options: cypressConfig,
            },
          ],
        },
      ],
    },
  };
};

export default defineConfig({
  component: {
    specPattern: "**/*.feature",
    supportFile: false,
    devServer(devServerConfig) {
      return devServer({
        ...devServerConfig,
        framework: "react",
        webpackConfig: webpackConfig(devServerConfig.cypressConfig),
      });
    },
  },
});
