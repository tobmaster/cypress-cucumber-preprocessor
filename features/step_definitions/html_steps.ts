import { Then } from "@cucumber/cucumber";
import path from "path";
import { promises as fs } from "fs";
import assert from "assert";

Then("there should be a HTML report", async function () {
  await assert.doesNotReject(
    () => fs.access(path.join(this.tmpDir, "cucumber-report.html")),
    "Expected there to be a HTML file"
  );
});
