# HTML reports

HTML reports can be enabled using the `html.enabled` property. The preprocessor uses [cosmiconfig](https://github.com/davidtheclark/cosmiconfig), which means you can place configuration options in EG. `.cypress-cucumber-preprocessorrc.json` or `package.json`. An example configuration is shown below.

```json
{
  "html": {
    "enabled": true
  }
}
```

This **requires** you to have registered this module in your [configuration file](https://docs.cypress.io/guides/references/configuration#Configuration-File), as shown below.

```ts
import { addCucumberPreprocessorPlugin } from "@badeball/cypress-cucumber-preprocessor";

export default defineConfig({
  e2e: {
    async setupNodeEvents(
      on: Cypress.PluginEvents,
      config: Cypress.PluginConfigOptions
    ) {
      await addCucumberPreprocessorPlugin(on, config);

      // Make sure to return the config object as it might have been modified by the plugin.
      return config;
    },
  },
});
```
